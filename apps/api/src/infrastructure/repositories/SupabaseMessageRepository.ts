import { IDbClient } from "../../domain/database/IDbClient";
import {
  GetChannelMessagesInput,
  IMessageRepository,
  SendMessageInput,
} from "../../domain/repositories/IMessageRepository";
import { Message, MessageStatus, MessageWithAuthor } from "../../domain/entities/Message";

interface MessageRow {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  status: MessageStatus;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface MessageWithAuthorRow extends MessageRow {
  author_name: string;
}

function toEntity(row: MessageRow): Message {
  return {
    id: row.id,
    channelId: row.channel_id,
    userId: row.user_id,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function toEntityWithAuthor(row: MessageWithAuthorRow): MessageWithAuthor {
  return { ...toEntity(row), authorName: row.author_name };
}

export class SupabaseMessageRepository implements IMessageRepository {
  // `db` es un cliente de pg que ya pasó por `withRLSContext`, así que cada
  // consulta de acá abajo se ejecuta como el rol de Postgres `authenticated`
  // con `request.jwt.claims.sub` seteado al usuario actual. Las políticas
  // `rw_messages_*` (ver database/rls/activate_rls.sql) hacen el control de
  // acceso real — esta clase solo escribe SQL plano y confía en que la BD lo haga cumplir.
  constructor(private readonly db: IDbClient) {}

  async create(input: SendMessageInput): Promise<MessageWithAuthor> {
    // Acá no chequeamos membresía — eso es trabajo de la política RLS de
    // insert (`rw_messages_insert`, que exige user_id = auth.uid() Y que el
    // usuario sea miembro del canal) más, una capa arriba, el caso de uso
    // SendMessage para dar un error más amigable antes de siquiera tocar la BD.
    //
    // El INSERT y el JOIN con rw_users van en pasos separados: un solo
    // `INSERT ... RETURNING` no puede traer columnas de otra tabla, así que
    // insertamos primero y resolvemos el nombre del autor con la segunda
    // consulta — que en este caso siempre es el usuario autenticado (lo
    // acabamos de insertar nosotros mismos), no hace falta un JOIN de verdad.
    const { rows } = await this.db.query<MessageRow>(
      `INSERT INTO rw_messages (channel_id, user_id, content, status)
       VALUES ($1, $2, $3, 'sent')
       RETURNING *`,
      [input.channelId, input.userId, input.content]
    );
    const message = rows[0]!;

    const { rows: userRows } = await this.db.query<{ name: string }>(
      `SELECT name FROM rw_users WHERE id = $1`,
      [message.user_id]
    );

    return toEntityWithAuthor({ ...message, author_name: userRows[0]?.name ?? "" });
  }

  async findByChannel({ channelId, cursor, limit }: GetChannelMessagesInput): Promise<MessageWithAuthor[]> {
    // Paginación por keyset: en vez de "saltate N filas" (OFFSET), le
    // pedimos a Postgres las filas "estrictamente más viejas que este punto
    // exacto del orden". Como el orden es (created_at DESC, id DESC) y
    // tenemos el índice compuesto idx_rw_messages_channel_created que
    // calza exacto con eso, esto es un único recorrido de índice sin
    // importar qué tan atrás esté el historial — un OFFSET 50000 obligaría
    // a Postgres a recorrer y descartar 50000 filas primero. La comparación
    // de valores en fila `(created_at, id) < (a, b)` es lo que hace correcto
    // el desempate por `id` cuando dos mensajes comparten el mismo milisegundo.
    //
    // El JOIN con rw_users trae el nombre del autor — sin esto, el frontend
    // no tiene forma de distinguir quién escribió cada mensaje ajeno más
    // que por su userId crudo.
    if (cursor) {
      const { rows } = await this.db.query<MessageWithAuthorRow>(
        `SELECT m.*, u.name AS author_name
         FROM rw_messages m
         JOIN rw_users u ON u.id = m.user_id
         WHERE m.channel_id = $1
           AND m.deleted_at IS NULL
           AND (m.created_at, m.id) < ($2, $3)
         ORDER BY m.created_at DESC, m.id DESC
         LIMIT $4`,
        [channelId, cursor.createdAt, cursor.id, limit]
      );
      return rows.map(toEntityWithAuthor);
    }

    const { rows } = await this.db.query<MessageWithAuthorRow>(
      `SELECT m.*, u.name AS author_name
       FROM rw_messages m
       JOIN rw_users u ON u.id = m.user_id
       WHERE m.channel_id = $1 AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $2`,
      [channelId, limit]
    );
    return rows.map(toEntityWithAuthor);
  }

  async findById(id: string): Promise<Message | null> {
    const { rows } = await this.db.query<MessageRow>(`SELECT * FROM rw_messages WHERE id = $1`, [id]);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async updateContent(id: string, content: string): Promise<MessageWithAuthor> {
    // El UPDATE en sí lo protege la política RLS `rw_messages_update`
    // (user_id = auth.uid() OR is_admin()) — EditMessage además valida la
    // autoría antes de llegar acá, para poder devolver un 403 amigable en
    // vez de que la fila simplemente no se actualice en silencio.
    const { rows } = await this.db.query<MessageRow>(
      `UPDATE rw_messages SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [content, id]
    );
    const message = rows[0]!;

    const { rows: userRows } = await this.db.query<{ name: string }>(
      `SELECT name FROM rw_users WHERE id = $1`,
      [message.user_id]
    );

    return toEntityWithAuthor({ ...message, author_name: userRows[0]?.name ?? "" });
  }

  async softDelete(id: string): Promise<void> {
    // El DELETE físico está prohibido para esta tabla — solo marcamos
    // deleted_at. La política de update del RLS igual chequea
    // user_id = auth.uid() OR is_admin(), así que esto no se puede usar
    // para borrar el mensaje de otra persona.
    await this.db.query(
      `UPDATE rw_messages SET deleted_at = NOW(), status = 'deleted' WHERE id = $1`,
      [id]
    );
  }

  async markAsRead(messageIds: string[], userId: string): Promise<void> {
    if (messageIds.length === 0) return;
    await this.db.query(
      `INSERT INTO rw_message_read_status (message_id, user_id, read_at)
       SELECT unnest($1::uuid[]), $2, NOW()
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [messageIds, userId]
    );
  }
}

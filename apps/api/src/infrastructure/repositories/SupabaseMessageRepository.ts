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
  // `db` is a pg client that already had `withRLSContext` run on it, so
  // every query below is executed as Postgres role `authenticated` with
  // `request.jwt.claims.sub` set to the current user. The `rw_messages_*`
  // policies (see database/rls/activate_rls.sql) do the actual gatekeeping —
  // this class just writes plain SQL and trusts the DB to enforce access.
  constructor(private readonly db: IDbClient) {}

  async create(input: SendMessageInput): Promise<MessageWithAuthor> {
    // We don't check membership here — that's the job of the RLS insert
    // policy (`rw_messages_insert`, which requires user_id = auth.uid() AND
    // the user being a member of the channel) plus, one layer up, the
    // SendMessage use case for a friendlier error before we even hit the DB.
    //
    // The INSERT and the JOIN with rw_users go in separate steps: a single
    // `INSERT ... RETURNING` can't bring back columns from another table,
    // so we insert first and resolve the author's name with a second
    // query — which in this case is always the authenticated user (we
    // just inserted them ourselves), so it's not really a "join" in spirit.
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
    // Keyset pagination: instead of "skip N rows" (OFFSET), we ask
    // Postgres for "rows strictly older than this exact point in the
    // ordering". Because the ordering is (created_at DESC, id DESC) and we
    // have the composite index idx_rw_messages_channel_created matching it
    // exactly, this is a single index range scan no matter how deep the
    // history is — OFFSET 50000 would force Postgres to walk and discard
    // 50000 rows first. The row-value comparison `(created_at, id) < (a, b)`
    // is what makes the tie-break on `id` correct when two messages share
    // the same millisecond timestamp.
    //
    // The JOIN with rw_users brings back the author's name — without it,
    // the frontend has no way to tell who wrote someone else's message
    // beyond their raw userId.
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
    // The UPDATE itself is protected by the `rw_messages_update` RLS
    // policy (user_id = auth.uid() OR is_admin()) — EditMessage also
    // validates authorship before reaching here, so it can return a
    // friendly 403 instead of the row silently not updating.
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
    // Physical DELETE is forbidden for this table — we only ever stamp
    // deleted_at. The RLS update policy still checks user_id = auth.uid()
    // OR is_admin(), so this can't be used to erase someone else's message.
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

import { IDbClient } from "../../domain/database/IDbClient";
import {
  GetChannelMessagesInput,
  IMessageRepository,
  SendMessageInput,
} from "../../domain/repositories/IMessageRepository";
import { Message, MessageStatus } from "../../domain/entities/Message";

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

export class SupabaseMessageRepository implements IMessageRepository {
  // `db` is a pg client that already had `withRLSContext` run on it, so
  // every query below is executed as Postgres role `authenticated` with
  // `request.jwt.claims.sub` set to the current user. The `rw_messages_*`
  // policies (see database/rls/activate_rls.sql) do the actual gatekeeping —
  // this class just writes plain SQL and trusts the DB to enforce access.
  constructor(private readonly db: IDbClient) {}

  async create(input: SendMessageInput): Promise<Message> {
    // We don't check membership here — that's the job of the RLS insert
    // policy (`rw_messages_insert`, which requires user_id = auth.uid() AND
    // the user being a member of the channel) plus, one layer up, the
    // SendMessage use case for a friendlier error before we even hit the DB.
    const { rows } = await this.db.query<MessageRow>(
      `INSERT INTO rw_messages (channel_id, user_id, content, status)
       VALUES ($1, $2, $3, 'sent')
       RETURNING *`,
      [input.channelId, input.userId, input.content]
    );
    return toEntity(rows[0]!);
  }

  async findByChannel({ channelId, cursor, limit }: GetChannelMessagesInput): Promise<Message[]> {
    // Keyset pagination: instead of "skip N rows" (OFFSET), we ask
    // Postgres for "rows strictly older than this exact point in the
    // ordering". Because the ordering is (created_at DESC, id DESC) and we
    // have the composite index idx_rw_messages_channel_created matching it
    // exactly, this is a single index range scan no matter how deep the
    // history is — OFFSET 50000 would force Postgres to walk and discard
    // 50000 rows first. The row-value comparison `(created_at, id) < (a, b)`
    // is what makes the tie-break on `id` correct when two messages share
    // the same millisecond timestamp.
    if (cursor) {
      const { rows } = await this.db.query<MessageRow>(
        `SELECT * FROM rw_messages
         WHERE channel_id = $1
           AND deleted_at IS NULL
           AND (created_at, id) < ($2, $3)
         ORDER BY created_at DESC, id DESC
         LIMIT $4`,
        [channelId, cursor.createdAt, cursor.id, limit]
      );
      return rows.map(toEntity);
    }

    const { rows } = await this.db.query<MessageRow>(
      `SELECT * FROM rw_messages
       WHERE channel_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [channelId, limit]
    );
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<Message | null> {
    const { rows } = await this.db.query<MessageRow>(`SELECT * FROM rw_messages WHERE id = $1`, [id]);
    return rows[0] ? toEntity(rows[0]) : null;
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

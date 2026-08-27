import { IDbClient } from "../../domain/database/IDbClient";
import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { Channel } from "../../domain/entities/Channel";

interface ChannelRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

function toEntity(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseChannelRepository implements IChannelRepository {
  constructor(private readonly db: IDbClient) {}

  async findById(id: string): Promise<Channel | null> {
    const { rows } = await this.db.query<ChannelRow>(`SELECT * FROM rw_channels WHERE id = $1`, [id]);
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async listForUser(userId: string): Promise<Channel[]> {
    // Explicit membership join on top of RLS: even if a policy is ever
    // relaxed by mistake, this query still only asks for what it needs.
    const { rows } = await this.db.query<ChannelRow>(
      `SELECT c.*
       FROM rw_channels c
       JOIN rw_channel_members cm ON cm.channel_id = c.id
       WHERE cm.user_id = $1
       ORDER BY c.name ASC`,
      [userId]
    );
    return rows.map(toEntity);
  }

  async isMember(channelId: string, userId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `SELECT 1 FROM rw_channel_members WHERE channel_id = $1 AND user_id = $2`,
      [channelId, userId]
    );
    return (rowCount ?? 0) > 0;
  }

  async create(input: { name: string; description?: string | null; createdBy: string }): Promise<Channel> {
    const { rows } = await this.db.query<ChannelRow>(
      `INSERT INTO rw_channels (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [input.name, input.description ?? null, input.createdBy]
    );
    return toEntity(rows[0]!);
  }

  async addMember(channelId: string, userId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO rw_channel_members (channel_id, user_id) VALUES ($1, $2)
       ON CONFLICT (channel_id, user_id) DO NOTHING`,
      [channelId, userId]
    );
  }
}

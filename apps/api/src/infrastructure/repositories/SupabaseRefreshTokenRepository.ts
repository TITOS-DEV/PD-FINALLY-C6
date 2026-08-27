import { IDbClient } from "../../domain/database/IDbClient";
import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { RefreshToken } from "../../domain/entities/RefreshToken";

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

function toEntity(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export class SupabaseRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly db: IDbClient) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshToken> {
    const { rows } = await this.db.query<RefreshTokenRow>(
      `INSERT INTO rw_refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.tokenHash, input.expiresAt]
    );
    return toEntity(rows[0]!);
  }

  async findActiveByUserId(userId: string): Promise<RefreshToken | null> {
    const { rows } = await this.db.query<RefreshTokenRow>(
      `SELECT * FROM rw_refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const { rows } = await this.db.query<RefreshTokenRow>(
      `SELECT * FROM rw_refresh_tokens WHERE token_hash = $1`,
      [tokenHash]
    );
    return rows[0] ? toEntity(rows[0]) : null;
  }

  async revoke(id: string): Promise<void> {
    await this.db.query(`UPDATE rw_refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [id]);
  }
}

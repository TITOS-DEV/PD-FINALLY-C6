import { IDbClient } from "../../domain/database/IDbClient";
import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { RefreshToken } from "../../domain/entities/RefreshToken";
import { isUniqueViolation } from "../db/pgErrors";

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

const SAVEPOINT = "replace_active_token";

export class SupabaseRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly db: IDbClient) {}

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

  /**
   * `login` and `refresh` each run inside ONE transaction per request (see
   * withSystemContext). That means if the INSERT below trips
   * `idx_rw_active_refresh_token_unique` (because another request for the
   * SAME user won the race and already inserted its own token), Postgres
   * leaves the WHOLE transaction "poisoned": any later command, including
   * a simple retry, gets rejected with "current transaction is aborted"
   * until there's a ROLLBACK.
   *
   * The way out is a SAVEPOINT: it's a restore point INSIDE the same
   * transaction. If the INSERT fails, we `ROLLBACK TO SAVEPOINT` (which
   * only cleans up that one error, not the whole transaction), and from
   * there we can retry — revoking again (this time we'll actually find
   * and clear the row the other request inserted) and inserting ours.
   */
  async replaceActiveToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshToken> {
    await this.revokeAllActiveFor(input.userId);
    await this.db.query(`SAVEPOINT ${SAVEPOINT}`);

    try {
      return await this.insertToken(input);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      await this.db.query(`ROLLBACK TO SAVEPOINT ${SAVEPOINT}`);
      await this.revokeAllActiveFor(input.userId);
      return this.insertToken(input);
    }
  }

  private async revokeAllActiveFor(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE rw_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  private async insertToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshToken> {
    const { rows } = await this.db.query<RefreshTokenRow>(
      `INSERT INTO rw_refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.userId, input.tokenHash, input.expiresAt]
    );
    return toEntity(rows[0]!);
  }
}

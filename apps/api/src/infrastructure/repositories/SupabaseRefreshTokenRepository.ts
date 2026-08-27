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
   * `login` y `refresh` corren dentro de UNA sola transacción por request
   * (ver withSystemContext). Eso significa que si el INSERT de acá abajo
   * choca contra `idx_rw_active_refresh_token_unique` (porque otra request
   * para el MISMO usuario ganó la carrera y ya insertó su propio token),
   * Postgres deja la transacción entera "envenenada": cualquier comando
   * posterior, incluido un simple reintento, sale rechazado con "current
   * transaction is aborted" hasta que haya un ROLLBACK.
   *
   * La salida es un SAVEPOINT: es un punto de restauración DENTRO de la
   * misma transacción. Si el INSERT falla, hacemos `ROLLBACK TO SAVEPOINT`
   * (que limpia SOLO ese error, no toda la transacción) y ahí sí podemos
   * reintentar — revocando de nuevo (esta vez sí vamos a encontrar y
   * limpiar la fila que insertó la otra request) e insertando la nuestra.
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

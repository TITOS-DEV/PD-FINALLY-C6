import { RefreshToken } from "../entities/RefreshToken";

export interface IRefreshTokenRepository {
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  /** Revoca un token puntual por id (usado por LogoutUser). */
  revoke(id: string): Promise<void>;
  /**
   * Revoca cualquier token activo del usuario e inserta uno nuevo como la
   * única sesión activa — es la operación que usan tanto el login como el
   * refresh para cumplir la regla de "un solo refresh token activo por
   * usuario" (índice único parcial `idx_rw_active_refresh_token_unique`,
   * ver DECISIONS.md). Es responsabilidad de la implementación manejar la
   * carrera de dos requests concurrentes para el mismo usuario sin dejar
   * escapar un error de base de datos.
   */
  replaceActiveToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshToken>;
}

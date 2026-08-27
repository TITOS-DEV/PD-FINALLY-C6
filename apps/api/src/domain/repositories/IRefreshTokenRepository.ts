import { RefreshToken } from "../entities/RefreshToken";

export interface IRefreshTokenRepository {
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  /** Revokes a single token by id (used by LogoutUser). */
  revoke(id: string): Promise<void>;
  /**
   * Revokes any active token for the user and inserts a new one as the
   * only active session — this is the operation both login and refresh use
   * to satisfy the "one active refresh token per user" rule (partial
   * unique index `idx_rw_active_refresh_token_unique`, see DECISIONS.md).
   * It's the implementation's responsibility to handle the race between
   * two concurrent requests for the same user without leaking a database
   * error.
   */
  replaceActiveToken(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshToken>;
}

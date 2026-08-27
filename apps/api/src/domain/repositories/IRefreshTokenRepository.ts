import { RefreshToken } from "../entities/RefreshToken";

export interface IRefreshTokenRepository {
  create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<RefreshToken>;
  /** The single active (non-revoked) token for a user, if any. The DB has a
   *  partial unique index guaranteeing there's at most one — see DECISIONS.md. */
  findActiveByUserId(userId: string): Promise<RefreshToken | null>;
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
}

/**
 * A refresh token session. Mirrors `rw_refresh_tokens`.
 *
 * We never store the raw refresh token, only a hash of it (`tokenHash`) —
 * same idea as passwords: if the DB ever leaks, the tokens inside it are
 * useless without the original value the client is holding.
 */
export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  /** Null while active. Set the moment it's rotated, replaced or logged out. */
  revokedAt: Date | null;
  createdAt: Date;
}

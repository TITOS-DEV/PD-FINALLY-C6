import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { JwtService } from "../../infrastructure/auth/JwtService";

/**
 * Logout just means "revoke the refresh token". The access token itself
 * can't be revoked (it's a stateless JWT) — it simply expires on its own
 * within JWT_ACCESS_EXPIRES_IN, which is exactly why we keep that window
 * short. Silently no-ops on an unknown token: logging out twice, or with a
 * garbage token, shouldn't be an error from the client's point of view.
 */
export class LogoutUser {
  constructor(
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly jwtService: JwtService
  ) {}

  async execute(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.jwtService.hashRefreshToken(rawRefreshToken);
    const existing = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (existing && !existing.revokedAt) {
      await this.refreshTokenRepository.revoke(existing.id);
    }
  }
}

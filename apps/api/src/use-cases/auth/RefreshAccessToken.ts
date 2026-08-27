import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { JwtService } from "../../infrastructure/auth/JwtService";
import { UnauthorizedError } from "../../domain/errors/AppError";

export interface RefreshAccessTokenOutput {
  accessToken: string;
  refreshToken: string;
}

/**
 * Refresh-token rotation: every time a refresh token is used, it's revoked
 * and replaced by a brand new one. If a stolen/old token ever gets replayed
 * after the legitimate client has already rotated it, it'll be found
 * already revoked here and the whole flow gets rejected — that's the
 * standard "reuse detection" refresh-token pattern.
 */
export class RefreshAccessToken {
  constructor(
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    private readonly userRepository: IUserRepository,
    private readonly jwtService: JwtService
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshAccessTokenOutput> {
    const tokenHash = this.jwtService.hashRefreshToken(rawRefreshToken);
    const existing = await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!existing) throw new UnauthorizedError("Refresh token not recognized");
    if (existing.revokedAt) throw new UnauthorizedError("Refresh token has already been used or revoked");
    if (existing.expiresAt.getTime() < Date.now()) throw new UnauthorizedError("Refresh token expired");

    const user = await this.userRepository.findById(existing.userId);
    if (!user) throw new UnauthorizedError("User no longer exists");

    // `replaceActiveToken` already revokes any active token for the user
    // before inserting the new one — since `existing` is one of those
    // active tokens (we already validated `!existing.revokedAt` above),
    // there's no need to revoke it separately here. And again, the race
    // between two near-simultaneous refreshes for the same user is handled
    // on the repository side (see SupabaseRefreshTokenRepository), not here.
    const newRawRefreshToken = this.jwtService.generateRefreshToken();
    await this.refreshTokenRepository.replaceActiveToken({
      userId: user.id,
      tokenHash: this.jwtService.hashRefreshToken(newRawRefreshToken),
      expiresAt: this.jwtService.getRefreshTokenExpiry(),
    });

    const accessToken = this.jwtService.signAccessToken({ sub: user.id, role: user.role });
    return { accessToken, refreshToken: newRawRefreshToken };
  }
}

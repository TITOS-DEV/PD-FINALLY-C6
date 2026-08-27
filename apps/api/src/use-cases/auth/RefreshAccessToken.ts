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

    // Rotate: kill the one that was just used, issue a fresh pair.
    await this.refreshTokenRepository.revoke(existing.id);

    const newRawRefreshToken = this.jwtService.generateRefreshToken();
    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: this.jwtService.hashRefreshToken(newRawRefreshToken),
      expiresAt: this.jwtService.getRefreshTokenExpiry(),
    });

    const accessToken = this.jwtService.signAccessToken({ sub: user.id, role: user.role });
    return { accessToken, refreshToken: newRawRefreshToken };
  }
}

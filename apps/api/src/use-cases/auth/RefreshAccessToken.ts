import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { JwtService } from "../../infrastructure/auth/JwtService";
import { UnauthorizedError } from "../../domain/errors/AppError";

export interface RefreshAccessTokenOutput {
  accessToken: string;
  refreshToken: string;
}

/**
 * Rotación de refresh token: cada vez que se usa un refresh token, se
 * revoca y se reemplaza por uno nuevo. Si un token robado/viejo se llega a
 * reusar después de que el cliente legítimo ya rotó, acá se lo va a
 * encontrar ya revocado y todo el flujo se rechaza — es el patrón estándar
 * de "detección de reuso" para refresh tokens.
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

    // `replaceActiveToken` ya revoca cualquier token activo del usuario
    // antes de insertar el nuevo — como `existing` es justo uno de esos
    // activos (ya lo validamos arriba), no hace falta revocarlo por
    // separado acá. Y, otra vez, la carrera entre dos refresh casi
    // simultáneos para el mismo usuario queda resuelta del lado del
    // repositorio (ver SupabaseRefreshTokenRepository), no acá.
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

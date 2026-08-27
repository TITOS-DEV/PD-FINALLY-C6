import { IRefreshTokenRepository } from "../../domain/repositories/IRefreshTokenRepository";
import { JwtService } from "../../infrastructure/auth/JwtService";

/**
 * Cerrar sesión es simplemente "revocar el refresh token". El access token
 * en sí no se puede revocar (es un JWT sin estado) — simplemente expira
 * solo dentro de la ventana de JWT_ACCESS_EXPIRES_IN, que es justo por eso
 * que la dejamos corta. No hace nada (sin error) con un token desconocido:
 * cerrar sesión dos veces, o con un token basura, no debería ser un error
 * desde el punto de vista del cliente.
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

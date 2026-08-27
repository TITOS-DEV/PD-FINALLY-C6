import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // id del usuario
  role: "user" | "admin";
}

/**
 * Envuelve todo lo relacionado con JWT: firmar/verificar el access token de
 * vida corta, y generar el string del refresh token en crudo (un valor
 * random opaco, NO un JWT — no hay razón para hacerlo parseable, solo se
 * busca por su hash en la BD).
 */
export class JwtService {
  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    // Lanza jwt.JsonWebTokenError / jwt.TokenExpiredError si falla — el
    // middleware de auth convierte cualquiera de los dos en un 401 limpio.
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  }

  /** Un string random e imposible de adivinar. Esto es lo que el cliente guarda como refresh token. */
  generateRefreshToken(): string {
    return crypto.randomBytes(48).toString("hex");
  }

  /**
   * Hasheamos el refresh token antes de guardarlo, igual que una
   * contraseña. Un SHA-256 simple alcanza acá (a diferencia de las
   * contraseñas, este "secreto" son 384 bits de data random — hacer fuerza
   * bruta no es una amenaza real, solo no queremos que quede en la BD en
   * texto plano).
   */
  hashRefreshToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  getRefreshTokenExpiry(): Date {
    return new Date(Date.now() + this.parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);
    const value = Number(match[1]);
    const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
    return value * unitMs;
  }
}

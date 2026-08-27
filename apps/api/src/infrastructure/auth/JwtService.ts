import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // user id
  role: "user" | "admin";
}

/**
 * Wraps everything JWT-related: signing/verifying the short-lived access
 * token, and generating the raw refresh token string (a random opaque
 * value, NOT a JWT — there's no reason to make it parseable, it's only
 * ever looked up by its hash in the DB).
 */
export class JwtService {
  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    } as jwt.SignOptions);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    // Throws jwt.JsonWebTokenError / jwt.TokenExpiredError on failure —
    // the auth middleware turns any of those into a clean 401.
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  }

  /** A random, unguessable string. This is what the client stores as the refresh token. */
  generateRefreshToken(): string {
    return crypto.randomBytes(48).toString("hex");
  }

  /**
   * We hash the refresh token before storing it, exactly like a password.
   * A simple SHA-256 is fine here (unlike passwords, this "secret" is 384
   * bits of random data — brute-forcing it is not a realistic concern, we
   * just don't want it sitting in the DB in plain text).
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

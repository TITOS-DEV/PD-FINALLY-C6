import { NextFunction, Request, Response } from "express";
import { JwtService } from "../../../infrastructure/auth/JwtService";
import { ForbiddenError, UnauthorizedError } from "../../../domain/errors/AppError";

const jwtService = new JwtService();

/**
 * Verifies the `Authorization: Bearer <access-token>` header and attaches
 * the decoded payload to `req.user`.
 *
 * This middleware is ONLY step one of "activating RLS": it tells us WHO is
 * making the request. It does NOT touch the database. Step two happens
 * inside each repository call, which wraps its queries with
 * `withRLSContext(req.user.id, ...)` (see infrastructure/db/withRLSContext.ts)
 * to actually propagate that user id into the Postgres session so
 * `auth.uid()` resolves correctly inside RLS policies.
 *
 * We keep these two steps separate on purpose: authentication (who are
 * you) is an HTTP concern, RLS activation (what can you see) is a database
 * concern, and Clean Architecture wants those living in different places.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header("Authorization");

  if (!header || !header.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing or malformed Authorization header"));
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    req.user = jwtService.verifyAccessToken(token);
    next();
  } catch {
    // Covers both an expired token and a tampered/invalid signature —
    // from the client's perspective both just mean "log in again".
    next(new UnauthorizedError("Access token is invalid or expired"));
  }
}

/** Route guard for admin-only endpoints. Must run after authMiddleware. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    return next(new ForbiddenError("This action requires an admin account"));
  }
  next();
}

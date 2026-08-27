import { NextFunction, Request, Response } from "express";
import { JwtService } from "../../../infrastructure/auth/JwtService";
import { ForbiddenError, UnauthorizedError } from "../../../domain/errors/AppError";

const jwtService = new JwtService();

/**
 * Verifica el header `Authorization: Bearer <access-token>` y le pega el
 * payload decodificado a `req.user`.
 *
 * Este middleware es SOLO el primer paso de "activar el RLS": nos dice
 * QUIÉN está haciendo la request. No toca la base de datos para nada. El
 * segundo paso pasa dentro de cada llamada a un repositorio, que envuelve
 * sus consultas con `withRLSContext(req.user.id, ...)` (ver
 * infrastructure/db/withRLSContext.ts) para de verdad propagar ese id de
 * usuario a la sesión de Postgres y que `auth.uid()` resuelva bien dentro
 * de las políticas RLS.
 *
 * Dejo estos dos pasos separados a propósito: la autenticación (quién eres)
 * es un asunto de HTTP, la activación del RLS (qué puedes ver) es un
 * asunto de base de datos, y Clean Architecture quiere que eso viva en lugares distintos.
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
    // Cubre tanto un token expirado como uno alterado/inválido — desde la
    // perspectiva del cliente, los dos significan lo mismo: hay que loguearse de nuevo.
    next(new UnauthorizedError("Access token is invalid or expired"));
  }
}

/** Guardia de ruta para endpoints solo de admin. Debe correr después de authMiddleware. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    return next(new ForbiddenError("This action requires an admin account"));
  }
  next();
}

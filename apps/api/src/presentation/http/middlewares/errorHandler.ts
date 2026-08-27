import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../domain/errors/AppError";
import { logger } from "../../../infrastructure/logging/logger";

/**
 * El único lugar de toda la app que decide cómo un error se convierte en
 * una respuesta HTTP. Todo lo de arriba (casos de uso, repositorios,
 * controllers) simplemente hace `throw` — esto es la red de seguridad.
 *
 * Dos caminos:
 *   1. Error conocido (AppError y sus hijas): confiamos en su
 *      statusCode/code/message y se los mandamos tal cual al cliente.
 *   2. Cualquier otra cosa (un bug, un error crudo de pg reventando, lo que
 *      sea): lo logueamos completo del lado del servidor, pero al cliente
 *      nunca le mandamos eso tal cual — nunca se filtra un stack trace ni
 *      un mensaje de SQL hacia afuera.
 *
 * Tiene que registrarse AL FINAL, después de todas las rutas (es un
 * requisito de Express: solo trata una función de 4 argumentos como manejador de errores).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = req.correlationId;

  if (err instanceof AppError) {
    logger.warn({ correlationId, code: err.code, details: err.details }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, correlationId },
    });
    return;
  }

  logger.error({ correlationId, err }, "Unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong on our end", correlationId },
  });
}

/** Fallback 404 para rutas que directamente no existen. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}`, correlationId: req.correlationId },
  });
}

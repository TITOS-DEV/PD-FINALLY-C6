import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../domain/errors/AppError";
import { logger } from "../../../infrastructure/logging/logger";

/**
 * The single place in the whole app that decides how an error becomes an
 * HTTP response. Everything upstream (use cases, repositories, controllers)
 * just throws — this is the safety net.
 *
 * Two paths:
 *   1. Known error (AppError and subclasses): we trust its statusCode/code/
 *      message and send them straight to the client.
 *   2. Anything else (a bug, a driver throwing a raw pg error, etc.): we
 *      log the full error server-side but only ever send a generic 500 to
 *      the client — never leak stack traces or SQL error messages to the
 *      outside world.
 *
 * Must be registered LAST, after all routes (that's an Express requirement
 * for 4-arg middlewares to be treated as error handlers).
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

/** 404 fallback for routes that don't exist at all. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.originalUrl}`, correlationId: req.correlationId },
  });
}

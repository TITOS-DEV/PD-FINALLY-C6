import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Every request gets an `X-Correlation-ID` — reused if the caller already
 * sent one (handy when a frontend or another service wants to trace a
 * request across systems), generated otherwise. We echo it back on the
 * response and stamp it on every log line for that request, so grepping
 * one ID in the logs gives you the full story of a single request.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("X-Correlation-ID");
  req.correlationId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();
  res.setHeader("X-Correlation-ID", req.correlationId);
  next();
}

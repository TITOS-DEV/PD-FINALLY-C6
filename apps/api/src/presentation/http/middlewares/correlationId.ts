import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Cada request recibe un `X-Correlation-ID` — se reutiliza si quien llama ya
 * mandó uno (útil cuando un frontend u otro servicio quiere trazar una
 * request a través de varios sistemas), o se genera si no. Lo devolvemos en
 * la respuesta y lo estampamos en cada línea de log de esa request, así
 * buscar un solo ID en los logs da la historia completa de una request.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("X-Correlation-ID");
  req.correlationId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();
  res.setHeader("X-Correlation-ID", req.correlationId);
  next();
}

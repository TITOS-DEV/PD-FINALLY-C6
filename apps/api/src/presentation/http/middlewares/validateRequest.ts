import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { ValidationError } from "../../../domain/errors/AppError";

type RequestPart = "body" | "query" | "params";

/**
 * Valida `req[part]` contra un schema de Zod y lo reemplaza por el
 * resultado ya parseado (con coerciones y defaults aplicados). Los
 * controllers después pueden confiar en la forma de los datos sin tener que
 * re-validar nada.
 */
export function validateRequest(schema: ZodTypeAny, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      return next(new ValidationError("Request validation failed", result.error.flatten()));
    }

    req[part] = result.data;
    next();
  };
}

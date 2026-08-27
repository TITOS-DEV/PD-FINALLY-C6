import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { ValidationError } from "../../../domain/errors/AppError";

type RequestPart = "body" | "query" | "params";

/**
 * Validates `req[part]` against a Zod schema and replaces it with the
 * parsed (and coerced/defaulted) result. Controllers can then trust the
 * shape of the data without re-checking anything.
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

import { NextFunction, Request, Response } from "express";

/**
 * Express doesn't catch rejected promises from async route handlers on its
 * own (that only landed as a default in Express 5). Wrapping every
 * controller with this means a thrown/rejected error always reaches
 * `errorHandler` via `next(err)`, instead of crashing the process or
 * hanging the request.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

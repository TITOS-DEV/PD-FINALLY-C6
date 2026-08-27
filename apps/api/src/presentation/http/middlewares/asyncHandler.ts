import { NextFunction, Request, Response } from "express";

/**
 * Express no atrapa solo las promesas rechazadas de los route handlers
 * async (eso recién quedó como default en Express 5). Envolver cada
 * controller con esto hace que cualquier error async siempre llegue a
 * `errorHandler` vía `next(err)`, en vez de tumbar el proceso o dejar la
 * request colgada para siempre.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

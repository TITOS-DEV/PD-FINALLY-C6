import { Request, Response } from "express";
import { withSystemContext } from "../../../infrastructure/db/withRLSContext";
import { buildSystemContainer } from "../../container";

/**
 * Every handler here runs with the SYSTEM db context, never withRLSContext:
 * there's no logged-in user yet (register/login), or the operation
 * (refresh/logout) is a trusted, backend-only lookup by token hash that has
 * nothing to do with the caller's row-level permissions.
 */
export const AuthController = {
  async register(req: Request, res: Response): Promise<void> {
    const user = await withSystemContext((db) => buildSystemContainer(db).registerUser.execute(req.body));
    res.status(201).json({ user });
  },

  async login(req: Request, res: Response): Promise<void> {
    const result = await withSystemContext((db) => buildSystemContainer(db).authenticateUser.execute(req.body));
    res.status(200).json(result);
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const result = await withSystemContext((db) =>
      buildSystemContainer(db).refreshAccessToken.execute(req.body.refreshToken)
    );
    res.status(200).json(result);
  },

  async logout(req: Request, res: Response): Promise<void> {
    await withSystemContext((db) => buildSystemContainer(db).logoutUser.execute(req.body.refreshToken));
    res.status(204).send();
  },
};

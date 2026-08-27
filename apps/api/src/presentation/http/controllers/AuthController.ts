import { Request, Response } from "express";
import { withSystemContext } from "../../../infrastructure/db/withRLSContext";
import { buildSystemContainer } from "../../container";

/**
 * Cada handler acá corre con el contexto de SISTEMA, nunca con
 * withRLSContext: todavía no hay usuario logueado (registro/login), o la
 * operación (refresh/logout) es una búsqueda confiable, propia del backend,
 * por hash de token, que no tiene nada que ver con los permisos por fila de quien llama.
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

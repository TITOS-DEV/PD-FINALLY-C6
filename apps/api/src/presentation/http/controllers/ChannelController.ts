import { Request, Response } from "express";
import { withRLSContext } from "../../../infrastructure/db/withRLSContext";
import { buildAuthenticatedContainer } from "../../container";

/**
 * `authMiddleware` corre antes que cualquier handler de acá, así que
 * `req.user` siempre está seteado. `withRLSContext(req.user.sub, ...)` es lo
 * que de verdad convierte esa identidad en una sesión con RLS activo para la consulta de abajo.
 */
export const ChannelController = {
  async list(req: Request, res: Response): Promise<void> {
    const channels = await withRLSContext(req.user!.sub, (db) =>
      buildAuthenticatedContainer(db).listMyChannels.execute(req.user!.sub)
    );
    res.status(200).json({ channels });
  },

  async create(req: Request, res: Response): Promise<void> {
    const channel = await withRLSContext(req.user!.sub, (db) =>
      buildAuthenticatedContainer(db).createChannel.execute({ ...req.body, createdBy: req.user!.sub })
    );
    res.status(201).json({ channel });
  },
};

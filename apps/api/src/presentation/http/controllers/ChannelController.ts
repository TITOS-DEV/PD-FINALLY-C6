import { Request, Response } from "express";
import { withRLSContext } from "../../../infrastructure/db/withRLSContext";
import { buildAuthenticatedContainer } from "../../container";

/**
 * `authMiddleware` runs before every handler here, so `req.user` is always
 * set. `withRLSContext(req.user.sub, ...)` is what actually turns that
 * identity into an active RLS session for the query below.
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

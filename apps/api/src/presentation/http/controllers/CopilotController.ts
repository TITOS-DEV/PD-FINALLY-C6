import { Request, Response } from "express";
import { withRLSContext } from "../../../infrastructure/db/withRLSContext";
import { buildAuthenticatedContainer } from "../../container";

export const CopilotController = {
  async ask(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    // Runs inside withRLSContext even though AskCopilot's SQL is a manual
    // join, not a plain SELECT relying only on policies — the RLS session
    // is still what the `rw_message_embeddings` policy checks as the last
    // line of defense (see AskCopilot.ts and the embedding repository).
    const result = await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).askCopilot.execute({ userId, question: req.body.question })
    );
    res.status(200).json(result);
  },
};

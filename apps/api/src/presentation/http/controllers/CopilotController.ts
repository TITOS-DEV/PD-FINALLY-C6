import { Request, Response } from "express";
import { withRLSContext } from "../../../infrastructure/db/withRLSContext";
import { buildAuthenticatedContainer } from "../../container";

export const CopilotController = {
  async ask(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    // Corre dentro de withRLSContext aunque el SQL de AskCopilot es un join
    // manual, no un SELECT plano que dependa solo de políticas — la sesión
    // con RLS igual es lo que la política de `rw_message_embeddings` chequea
    // como última línea de defensa (ver AskCopilot.ts y el repositorio de embeddings).
    const result = await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).askCopilot.execute({ userId, question: req.body.question })
    );
    res.status(200).json(result);
  },
};

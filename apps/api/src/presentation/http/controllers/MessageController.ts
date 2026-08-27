import { Request, Response } from "express";
import { withRLSContext, withSystemContext } from "../../../infrastructure/db/withRLSContext";
import { buildAuthenticatedContainer, buildEmbeddingIndexer } from "../../container";
import { emitMessageCreated, emitMessageDeleted, emitMessageUpdated } from "../../websocket/messageEvents";
import { logger } from "../../../infrastructure/logging/logger";

export const MessageController = {
  async send(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    const message = await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).sendMessage.execute({
        userId,
        channelId: req.params.channelId!,
        content: req.body.content,
      })
    );

    // Avisamos a todos en el canal de inmediato — que no tengan que esperar
    // a que el embedding termine de indexarse.
    emitMessageCreated(message);
    res.status(201).json({ message });

    // Indexado en modo fire-and-forget para el copiloto. Corre con el
    // contexto de sistema (las escrituras en rw_message_embeddings son
    // `TO service_role`) y DESPUÉS de que la respuesta ya se mandó: una
    // llamada de embedding lenta o que falle nunca debe hacer esperar a
    // quien envió el mensaje ni hacerle pensar que su mensaje falló.
    withSystemContext((db) => buildEmbeddingIndexer(db).execute({ messageId: message.id, content: message.content })).catch(
      (error) => logger.error({ err: error, messageId: message.id }, "Failed to index message embedding")
    );
  },

  async list(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    const { cursorCreatedAt, cursorId, limit } = req.query as unknown as {
      cursorCreatedAt?: string;
      cursorId?: string;
      limit?: number;
    };

    const result = await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).getChannelMessages.execute({
        userId,
        channelId: req.params.channelId!,
        limit,
        cursor: cursorCreatedAt && cursorId ? { createdAt: new Date(cursorCreatedAt), id: cursorId } : undefined,
      })
    );

    res.status(200).json(result);
  },

  async markAsRead(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).markMessagesAsRead.execute({ userId, messageIds: req.body.messageIds })
    );
    res.status(204).send();
  },

  async edit(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    const message = await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).editMessage.execute({
        messageId: req.params.messageId!,
        userId,
        userRole: req.user!.role,
        content: req.body.content,
      })
    );

    emitMessageUpdated(message);
    res.status(200).json({ message });

    // El contenido cambió, así que el embedding viejo ya no representa lo
    // que dice el mensaje — lo regeneramos igual que al crearlo, también
    // en modo fire-and-forget para no demorar la respuesta.
    withSystemContext((db) => buildEmbeddingIndexer(db).execute({ messageId: message.id, content: message.content })).catch(
      (error) => logger.error({ err: error, messageId: message.id }, "Failed to re-index edited message embedding")
    );
  },

  async delete(req: Request, res: Response): Promise<void> {
    const userId = req.user!.sub;
    const { channelId } = await withRLSContext(userId, (db) =>
      buildAuthenticatedContainer(db).deleteMessage.execute({
        messageId: req.params.messageId!,
        userId,
        userRole: req.user!.role,
      })
    );

    emitMessageDeleted({ id: req.params.messageId!, channelId });
    res.status(204).send();
  },
};

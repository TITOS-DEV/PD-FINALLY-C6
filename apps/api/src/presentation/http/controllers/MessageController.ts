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

    // Tell everyone in the channel right away — don't make them wait for
    // the embedding to be indexed first.
    emitMessageCreated(message);
    res.status(201).json({ message });

    // Fire-and-forget indexing for the copilot. Runs with the system
    // context (rw_message_embeddings writes are `TO service_role`) and
    // AFTER the response is already sent: a slow or failing embedding call
    // must never make the sender wait or think their message failed.
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

    // The content changed, so the old embedding no longer represents what
    // the message says — we regenerate it just like on creation, also
    // fire-and-forget so it doesn't delay the response.
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

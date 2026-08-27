import { Router } from "express";
import { MessageController } from "../controllers/MessageController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validateRequest } from "../middlewares/validateRequest";
import {
  channelParamsSchema,
  editMessageSchema,
  getMessagesQuerySchema,
  markAsReadSchema,
  messageParamsSchema,
  sendMessageSchema,
} from "../validators/messages.schemas";

export const messagesRoutes = Router();

messagesRoutes.use(authMiddleware);

messagesRoutes.post(
  "/channels/:channelId/messages",
  validateRequest(channelParamsSchema, "params"),
  validateRequest(sendMessageSchema),
  asyncHandler(MessageController.send)
);

messagesRoutes.get(
  "/channels/:channelId/messages",
  validateRequest(channelParamsSchema, "params"),
  validateRequest(getMessagesQuerySchema, "query"),
  asyncHandler(MessageController.list)
);

messagesRoutes.post(
  "/messages/read-receipts",
  validateRequest(markAsReadSchema),
  asyncHandler(MessageController.markAsRead)
);

messagesRoutes.patch(
  "/messages/:messageId",
  validateRequest(messageParamsSchema, "params"),
  validateRequest(editMessageSchema),
  asyncHandler(MessageController.edit)
);

messagesRoutes.delete(
  "/messages/:messageId",
  validateRequest(messageParamsSchema, "params"),
  asyncHandler(MessageController.delete)
);

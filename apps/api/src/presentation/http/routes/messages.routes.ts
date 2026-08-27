import { Router } from "express";
import { MessageController } from "../controllers/MessageController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validateRequest } from "../middlewares/validateRequest";
import {
  channelParamsSchema,
  getMessagesQuerySchema,
  markAsReadSchema,
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

import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { channelsRoutes } from "./channels.routes";
import { messagesRoutes } from "./messages.routes";
import { copilotRoutes } from "./copilot.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/channels", channelsRoutes);
// messagesRoutes es dueña tanto de /channels/:channelId/messages como de /messages/read-receipts
apiRouter.use("/", messagesRoutes);
apiRouter.use("/copilot", copilotRoutes);

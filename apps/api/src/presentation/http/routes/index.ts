import { Router } from "express";
import { authRoutes } from "./auth.routes";
import { channelsRoutes } from "./channels.routes";
import { messagesRoutes } from "./messages.routes";
import { copilotRoutes } from "./copilot.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/channels", channelsRoutes);
// messagesRoutes owns both /channels/:channelId/messages and /messages/read-receipts
apiRouter.use("/", messagesRoutes);
apiRouter.use("/copilot", copilotRoutes);

import { Router } from "express";
import { ChannelController } from "../controllers/ChannelController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validateRequest } from "../middlewares/validateRequest";
import { createChannelSchema } from "../validators/messages.schemas";

export const channelsRoutes = Router();

channelsRoutes.use(authMiddleware);
channelsRoutes.get("/", asyncHandler(ChannelController.list));
channelsRoutes.post("/", validateRequest(createChannelSchema), asyncHandler(ChannelController.create));

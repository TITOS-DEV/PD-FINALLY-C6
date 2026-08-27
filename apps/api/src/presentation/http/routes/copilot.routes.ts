import { Router } from "express";
import { CopilotController } from "../controllers/CopilotController";
import { authMiddleware } from "../middlewares/authMiddleware";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validateRequest } from "../middlewares/validateRequest";
import { askCopilotSchema } from "../validators/copilot.schemas";

export const copilotRoutes = Router();

copilotRoutes.use(authMiddleware);
copilotRoutes.post("/ask", validateRequest(askCopilotSchema), asyncHandler(CopilotController.ask));

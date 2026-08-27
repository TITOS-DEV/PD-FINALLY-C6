import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validateRequest } from "../middlewares/validateRequest";
import { loginSchema, refreshSchema, registerSchema } from "../validators/auth.schemas";

export const authRoutes = Router();

authRoutes.post("/register", validateRequest(registerSchema), asyncHandler(AuthController.register));
authRoutes.post("/login", validateRequest(loginSchema), asyncHandler(AuthController.login));
authRoutes.post("/refresh", validateRequest(refreshSchema), asyncHandler(AuthController.refresh));
authRoutes.post("/logout", validateRequest(refreshSchema), asyncHandler(AuthController.logout));

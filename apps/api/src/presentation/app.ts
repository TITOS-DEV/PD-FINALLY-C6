import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { correlationId } from "./http/middlewares/correlationId";
import { errorHandler, notFoundHandler } from "./http/middlewares/errorHandler";
import { apiRouter } from "./http/routes";
import { env } from "../infrastructure/config/env";

/**
 * Builds the Express app WITHOUT starting an HTTP server or Socket.io.
 * Kept separate from server.ts so e2e tests can `supertest(createApp())`
 * directly, with no open port and no socket lifecycle to clean up.
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));
  app.use(correlationId);

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler); // must be last: Express only treats a 4-arg function as an error handler

  return app;
}

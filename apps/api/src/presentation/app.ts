import express, { Express, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { correlationId } from "./http/middlewares/correlationId";
import { errorHandler, notFoundHandler } from "./http/middlewares/errorHandler";
import { apiRouter } from "./http/routes";
import { openApiSpec } from "./http/openapi/openapiSpec";
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

  // Swagger UI needs to run its own inline scripts/styles — helmet's
  // default Content-Security-Policy would block that, so we drop it just
  // on this documentation route, not on the rest of the API.
  app.get("/api/openapi.json", (_req, res) => res.status(200).json(openApiSpec));
  app.use(
    "/api/docs",
    (_req: Request, res: Response, next: NextFunction) => {
      res.removeHeader("Content-Security-Policy");
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec)
  );

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler); // must be last: Express only treats a 4-arg function as an error handler

  return app;
}

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
 * Arma la app de Express SIN levantar un servidor HTTP ni Socket.io.
 * Se deja separado de server.ts para que los tests e2e puedan hacer
 * `supertest(createApp())` directo, sin puerto abierto ni ciclo de vida de sockets que limpiar.
 */
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: "1mb" }));
  app.use(correlationId);

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

  // Swagger UI necesita poder correr sus propios scripts/estilos inline —
  // el Content-Security-Policy por defecto de helmet se lo bloquearía, así
  // que se lo sacamos SOLO en esta ruta de documentación, no en el resto de la API.
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
  app.use(errorHandler); // tiene que ir al final: Express solo trata una función de 4 argumentos como manejador de errores

  return app;
}

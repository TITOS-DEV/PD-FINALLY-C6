import http from "node:http";
import { env } from "./infrastructure/config/env";
import { createApp } from "./presentation/app";
import { attachSocketServer } from "./presentation/websocket/socketServer";
import { pool, closePool } from "./infrastructure/db/pool";
import { logger } from "./infrastructure/logging/logger";

/**
 * Composition root: the one place that actually wires the HTTP server, the
 * WebSocket server and the DB pool together and starts listening. Every
 * other file in this project is either a pure building block or something
 * this file assembles — nothing else in the codebase calls `.listen()`.
 */
async function bootstrap(): Promise<void> {
  // Fail fast if we can't even reach Postgres — better a crash-on-boot with
  // a clear log line than a server that "works" until the first request.
  await pool.query("SELECT 1");
  logger.info("Database connection OK");

  const app = createApp();
  const httpServer = http.createServer(app);

  // Socket.io shares the same HTTP server/port as Express — no second port
  // to expose, configure or document.
  attachSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Riwi Internal Messenger API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Graceful shutdown: stop accepting new connections, then close the DB
  // pool, so in-flight requests get a chance to finish instead of getting
  // their connection yanked mid-query.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    httpServer.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "Fatal error during startup");
  process.exit(1);
});

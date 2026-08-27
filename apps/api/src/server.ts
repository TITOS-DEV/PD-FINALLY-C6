import http from "node:http";
import { env } from "./infrastructure/config/env";
import { createApp } from "./presentation/app";
import { attachSocketServer } from "./presentation/websocket/socketServer";
import { pool, closePool } from "./infrastructure/db/pool";
import { logger } from "./infrastructure/logging/logger";

/**
 * Composition root: el único lugar que de verdad conecta el servidor HTTP,
 * el servidor de WebSockets y el pool de BD, y arranca a escuchar. Todo lo
 * demás en este proyecto es un bloque puro o algo que este archivo ensambla
 * — ningún otro archivo del código llama a `.listen()`.
 */
async function bootstrap(): Promise<void> {
  // Fallamos rápido si ni siquiera podemos llegar a Postgres — mejor un
  // crash al arrancar con un log claro que un servidor que "funciona" hasta la primera request.
  await pool.query("SELECT 1");
  logger.info("Database connection OK");

  const app = createApp();
  const httpServer = http.createServer(app);

  // Socket.io comparte el mismo servidor HTTP/puerto que Express — ningún
  // segundo puerto que exponer, configurar ni documentar.
  attachSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`🚀 Riwi Internal Messenger API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Apagado gracioso: dejamos de aceptar conexiones nuevas y después
  // cerramos el pool de BD, para que las requests en curso tengan chance de
  // terminar en vez de que les corten la conexión a mitad de una consulta.
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

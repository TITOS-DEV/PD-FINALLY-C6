import { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { JwtService } from "../../infrastructure/auth/JwtService";
import { withRLSContext } from "../../infrastructure/db/withRLSContext";
import { buildAuthenticatedContainer } from "../container";
import { MessageDeletedPayload, messageEvents, MESSAGE_CREATED, MESSAGE_DELETED, MESSAGE_UPDATED } from "./messageEvents";
import { logger } from "../../infrastructure/logging/logger";
import { env } from "../../infrastructure/config/env";
import { Message } from "../../domain/entities/Message";

const jwtService = new JwtService();

/**
 * Capa de tiempo real. La autenticación acá refleja al `authMiddleware` de
 * HTTP: el mismo access token, solo que leído del handshake en vez de un
 * header. Una vez conectado, un socket puede pedir `join:channel` —
 * chequeamos membresía con el mismo repositorio escopeado por RLS que usa
 * la API REST, así que "esto puede ver este canal por socket" siempre
 * coincide con "esto puede verlo por HTTP".
 */
export function attachSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));

    try {
      socket.data.user = jwtService.verifyAccessToken(token);
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.user.sub as string;
    logger.info({ userId, socketId: socket.id }, "socket connected");

    socket.on("join:channel", async (channelId: string, ack?: (ok: boolean) => void) => {
      try {
        const isMember = await withRLSContext(userId, async (db) => {
          const channels = await buildAuthenticatedContainer(db).listMyChannels.execute(userId);
          return channels.some((channel) => channel.id === channelId);
        });

        if (isMember) {
          socket.join(roomFor(channelId));
        }
        ack?.(isMember);
      } catch (error) {
        logger.error({ err: error, channelId, userId }, "join:channel failed");
        ack?.(false);
      }
    });

    socket.on("leave:channel", (channelId: string) => {
      socket.leave(roomFor(channelId));
    });

    socket.on("disconnect", () => {
      logger.info({ userId, socketId: socket.id }, "socket disconnected");
    });
  });

  // Puente desde la capa HTTP: cada vez que MessageController guarda un
  // mensaje, emite acá — nosotros solo lo transmitimos a quien se haya
  // unido a la sala de ese canal.
  messageEvents.on(MESSAGE_CREATED, (message: Message) => {
    io.to(roomFor(message.channelId)).emit("message:new", message);
  });

  messageEvents.on(MESSAGE_UPDATED, (message: Message) => {
    io.to(roomFor(message.channelId)).emit("message:updated", message);
  });

  messageEvents.on(MESSAGE_DELETED, (payload: MessageDeletedPayload) => {
    io.to(roomFor(payload.channelId)).emit("message:deleted", payload);
  });

  return io;
}

function roomFor(channelId: string): string {
  return `channel:${channelId}`;
}

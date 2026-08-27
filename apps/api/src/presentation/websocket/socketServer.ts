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
 * Realtime layer. Auth here mirrors the HTTP `authMiddleware`: the same
 * access token, just read from the handshake instead of a header. Once
 * connected, a socket can ask to `join:channel` — we check membership with
 * the same RLS-scoped repository the REST API uses, so "can this socket see
 * this channel" always agrees with "can this user's HTTP calls see it".
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

  // Bridge from the HTTP layer: whenever MessageController saves a message,
  // it emits here — we just broadcast it to whoever joined that channel's room.
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

import { EventEmitter } from "node:events";
import { Message } from "../../domain/entities/Message";

/**
 * Small in-process event bus that decouples the HTTP layer from the
 * WebSocket layer: MessageController doesn't need to know Socket.io
 * exists, it just emits "a message was created". socketServer.ts is the
 * only file that listens and turns that into a `io.to(room).emit(...)`.
 * Good enough for a single-process deployment; a multi-instance setup
 * would swap this for a Redis pub/sub adapter without touching either side.
 */
export const messageEvents = new EventEmitter();

export const MESSAGE_CREATED = "message:created";

export function emitMessageCreated(message: Message): void {
  messageEvents.emit(MESSAGE_CREATED, message);
}

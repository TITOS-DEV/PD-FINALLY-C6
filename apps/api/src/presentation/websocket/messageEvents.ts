import { EventEmitter } from "node:events";
import { Message } from "../../domain/entities/Message";

/**
 * Small in-process event bus that decouples the HTTP layer from the
 * WebSocket layer: MessageController doesn't need to know Socket.io
 * exists, it just emits "something happened to a message". socketServer.ts
 * is the only file that listens and turns that into a
 * `io.to(room).emit(...)`. Good enough for a single-process deployment; a
 * multi-instance setup would swap this for a Redis pub/sub adapter without
 * touching either side.
 */
export const messageEvents = new EventEmitter();

export const MESSAGE_CREATED = "message:created";
export const MESSAGE_UPDATED = "message:updated";
export const MESSAGE_DELETED = "message:deleted";

export interface MessageDeletedPayload {
  id: string;
  channelId: string;
}

export function emitMessageCreated(message: Message): void {
  messageEvents.emit(MESSAGE_CREATED, message);
}

/** Same event shape for "I edited the content" as for any future message state change. */
export function emitMessageUpdated(message: Message): void {
  messageEvents.emit(MESSAGE_UPDATED, message);
}

/** Only sends the id + channel — the message itself no longer "exists" for whoever is watching, its content doesn't matter anymore. */
export function emitMessageDeleted(payload: MessageDeletedPayload): void {
  messageEvents.emit(MESSAGE_DELETED, payload);
}

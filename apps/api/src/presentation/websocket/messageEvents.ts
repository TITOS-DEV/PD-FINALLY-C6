import { EventEmitter } from "node:events";
import { Message } from "../../domain/entities/Message";

/**
 * Bus de eventos chiquito, en el mismo proceso, que desacopla la capa HTTP
 * de la capa de WebSockets: MessageController no necesita saber que
 * Socket.io existe, solo emite "pasó esto con un mensaje". socketServer.ts es
 * el único archivo que escucha y lo convierte en un `io.to(room).emit(...)`.
 * Alcanza para un despliegue de un solo proceso; un setup con varias
 * instancias cambiaría esto por un adaptador de pub/sub con Redis sin tocar
 * ninguno de los dos lados.
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

/** Mismo evento tanto para "edité el contenido" como para futuros cambios de estado del mensaje. */
export function emitMessageUpdated(message: Message): void {
  messageEvents.emit(MESSAGE_UPDATED, message);
}

/** Solo manda el id + canal — el mensaje en sí no "existe más" para quien está mirando, no hace falta su contenido. */
export function emitMessageDeleted(payload: MessageDeletedPayload): void {
  messageEvents.emit(MESSAGE_DELETED, payload);
}

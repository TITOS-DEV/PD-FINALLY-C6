/** Un mensaje dentro de un canal. Refleja la tabla `rw_messages`. */
export type MessageStatus = "pending" | "sent" | "failed" | "deleted";

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
  /**
   * El borrado físico está prohibido en las reglas del proyecto.
   * `deletedAt` es la única forma en que un mensaje "desaparece" — se queda
   * en la tabla para auditoría, integridad referencial, y para que el
   * índice del RAG simplemente lo filtre.
   */
  deletedAt: Date | null;
}

/**
 * `Message` con el nombre del autor pegado al lado — no es una columna de
 * `rw_messages`, sale de un join con `rw_users` en el repositorio (el mismo
 * truco que ya usa la búsqueda del copiloto). Sin esto, el frontend no
 * tiene forma de saber quién escribió un mensaje ajeno más que por su
 * `userId` crudo, así que todos los mensajes de "otra persona" se veían
 * idénticos en el chat sin importar quién los mandó.
 */
export interface MessageWithAuthor extends Message {
  authorName: string;
}

/** El embedding vectorial ligado 1 a 1 a un mensaje, usado para la búsqueda del copiloto RAG. */
export interface MessageEmbedding {
  messageId: string;
  embedding: number[];
  createdAt: Date;
}

/** Una confirmación de lectura: una fila por (mensaje, usuario) que ya lo vio. */
export interface MessageReadStatus {
  messageId: string;
  userId: string;
  readAt: Date;
}

/**
 * Cursor usado para la paginación por keyset sobre los mensajes.
 * Paginamos por (created_at, id) en vez de OFFSET — ver DECISIONS.md para el "por qué".
 */
export interface MessageCursor {
  createdAt: Date;
  id: string;
}

/**
 * Espejo del `Message` del backend. El status 'pending' es justo el que
 * usamos del lado del cliente para el mensaje optimista mientras la
 * request POST todavía no responde — ver ChatStore.
 */
export type MessageStatus = 'pending' | 'sent' | 'failed' | 'deleted';

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  /** Nombre real del autor — el backend lo resuelve con un join a rw_users, no es texto que inventemos acá. */
  authorName: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Cursor de paginación por keyset — mismo shape que MessageCursor del backend. */
export interface MessageCursor {
  createdAt: string;
  id: string;
}

export interface GetChannelMessagesResponse {
  messages: Message[];
  nextCursor: MessageCursor | null;
}

/** Lo que manda el WebSocket cuando alguien borra un mensaje — solo lo necesario para poder quitarlo de la vista. */
export interface MessageDeletedPayload {
  id: string;
  channelId: string;
}

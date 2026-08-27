import { Message, MessageCursor, MessageWithAuthor } from "../entities/Message";

export interface SendMessageInput {
  channelId: string;
  userId: string;
  content: string;
}

export interface GetChannelMessagesInput {
  channelId: string;
  /** Se omite para traer la primera página (la más reciente). */
  cursor?: MessageCursor;
  limit: number;
}

export interface IMessageRepository {
  /** Devuelve el mensaje ya con `authorName` (join con rw_users) — ver MessageWithAuthor. */
  create(input: SendMessageInput): Promise<MessageWithAuthor>;
  /**
   * Lectura del historial de un canal paginada por keyset, la más nueva primero.
   * Nada de OFFSET en ningún lado — ver DECISIONS.md para el porqué importa acá.
   */
  findByChannel(input: GetChannelMessagesInput): Promise<MessageWithAuthor[]>;
  findById(id: string): Promise<Message | null>;
  /** Edita el contenido — la política RLS de update exige ser el autor o admin. */
  updateContent(id: string, content: string): Promise<MessageWithAuthor>;
  /** Solo soft delete — el DELETE físico está prohibido para esta tabla. */
  softDelete(id: string): Promise<void>;
  markAsRead(messageIds: string[], userId: string): Promise<void>;
}

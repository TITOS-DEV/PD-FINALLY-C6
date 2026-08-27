import { Message, MessageCursor } from "../entities/Message";

export interface SendMessageInput {
  channelId: string;
  userId: string;
  content: string;
}

export interface GetChannelMessagesInput {
  channelId: string;
  /** Omit to get the first (most recent) page. */
  cursor?: MessageCursor;
  limit: number;
}

export interface IMessageRepository {
  create(input: SendMessageInput): Promise<Message>;
  /**
   * Keyset-paginated read of a channel's history, newest first.
   * No OFFSET anywhere — see DECISIONS.md for why that matters here.
   */
  findByChannel(input: GetChannelMessagesInput): Promise<Message[]>;
  findById(id: string): Promise<Message | null>;
  /** Soft delete only — physical DELETE is forbidden for this table. */
  softDelete(id: string): Promise<void>;
  markAsRead(messageIds: string[], userId: string): Promise<void>;
}

import { Message, MessageCursor, MessageWithAuthor } from "../entities/Message";

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
  /** Returns the message already with `authorName` (join with rw_users) — see MessageWithAuthor. */
  create(input: SendMessageInput): Promise<MessageWithAuthor>;
  /**
   * Keyset-paginated read of a channel's history, newest first.
   * No OFFSET anywhere — see DECISIONS.md for why that matters here.
   */
  findByChannel(input: GetChannelMessagesInput): Promise<MessageWithAuthor[]>;
  findById(id: string): Promise<Message | null>;
  /** Edits the content — the RLS update policy requires being the author or an admin. */
  updateContent(id: string, content: string): Promise<MessageWithAuthor>;
  /** Soft delete only — physical DELETE is forbidden for this table. */
  softDelete(id: string): Promise<void>;
  markAsRead(messageIds: string[], userId: string): Promise<void>;
}

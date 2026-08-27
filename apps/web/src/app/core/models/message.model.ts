/**
 * Message status enum: 'pending' tracks optimistic client messages before POST resolution.
 */
export type MessageStatus = 'pending' | 'sent' | 'failed' | 'deleted';

export interface Message {
  id: string;
  channelId: string;
  userId: string;
  /** Author display name joined from `rw_users` by backend service. */
  authorName: string;
  content: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Keyset pagination cursor matching backend `MessageCursor`. */
export interface MessageCursor {
  createdAt: string;
  id: string;
}

export interface GetChannelMessagesResponse {
  messages: Message[];
  nextCursor: MessageCursor | null;
}

/** WebSocket message deletion event payload. */
export interface MessageDeletedPayload {
  id: string;
  channelId: string;
}

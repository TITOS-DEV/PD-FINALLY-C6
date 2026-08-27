/** A message inside a channel. Mirrors the `rw_messages` table. */
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
   * Physical deletion is forbidden by the project rules. `deletedAt` is the
   * only way a message "disappears" — it stays in the table for auditing,
   * referential integrity and so the RAG index can just filter it out.
   */
  deletedAt: Date | null;
}

/** The vector embedding tied 1:1 to a message, used for the RAG copilot search. */
export interface MessageEmbedding {
  messageId: string;
  embedding: number[];
  createdAt: Date;
}

/** A read receipt: one row per (message, user) that has seen it. */
export interface MessageReadStatus {
  messageId: string;
  userId: string;
  readAt: Date;
}

/**
 * Cursor used for keyset pagination over messages. We paginate by
 * (created_at, id) instead of OFFSET — see DECISIONS.md for the "why".
 */
export interface MessageCursor {
  createdAt: Date;
  id: string;
}

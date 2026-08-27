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

/**
 * `Message` with the author's name attached — not a column on
 * `rw_messages`, it comes from a join with `rw_users` in the repository
 * (the same trick the copilot's search already uses). Without this, the
 * frontend has no way to know who wrote someone else's message beyond
 * their raw `userId`.
 */
export interface MessageWithAuthor extends Message {
  authorName: string;
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

export interface SimilarMessageMatch {
  messageId: string;
  channelId: string;
  content: string;
  authorName: string;
  createdAt: Date;
  /** Cosine similarity, 1 = identical, 0 = unrelated. */
  similarity: number;
}

export interface IMessageEmbeddingRepository {
  upsert(messageId: string, embedding: number[]): Promise<void>;
  /**
   * Vector similarity search, restricted to channels `userId` belongs to.
   * RLS enforces this too at the DB level, but the query filters
   * explicitly as well — see DECISIONS.md, "defense in depth" section.
   */
  findSimilarInUserChannels(input: {
    userId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<SimilarMessageMatch[]>;
}

export interface SimilarMessageMatch {
  messageId: string;
  channelId: string;
  content: string;
  authorName: string;
  createdAt: Date;
  /** Similitud coseno, 1 = idéntico, 0 = sin relación. */
  similarity: number;
}

export interface IMessageEmbeddingRepository {
  upsert(messageId: string, embedding: number[]): Promise<void>;
  /**
   * Búsqueda por similitud vectorial, restringida a los canales a los que
   * pertenece `userId`. El RLS también obliga esto a nivel de BD, pero la
   * consulta filtra explícito además — ver DECISIONS.md, sección "defensa en profundidad".
   */
  findSimilarInUserChannels(input: {
    userId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<SimilarMessageMatch[]>;
}

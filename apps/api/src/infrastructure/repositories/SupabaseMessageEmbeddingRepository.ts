import { IDbClient } from "../../domain/database/IDbClient";
import {
  IMessageEmbeddingRepository,
  SimilarMessageMatch,
} from "../../domain/repositories/IMessageEmbeddingRepository";

interface MatchRow {
  message_id: string;
  channel_id: string;
  content: string;
  author_name: string;
  created_at: Date;
  similarity: number;
}

/** pgvector wants its literal as `[0.1,0.2,...]`, not a JS array. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export class SupabaseMessageEmbeddingRepository implements IMessageEmbeddingRepository {
  constructor(private readonly db: IDbClient) {}

  async upsert(messageId: string, embedding: number[]): Promise<void> {
    // Runs with the system/service context (see withSystemContext), matching
    // the `rw_message_embeddings_insert` policy which is `TO service_role`.
    await this.db.query(
      `INSERT INTO rw_message_embeddings (message_id, embedding)
       VALUES ($1, $2::vector)
       ON CONFLICT (message_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
      [messageId, toVectorLiteral(embedding)]
    );
  }

  async findSimilarInUserChannels(input: {
    userId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<SimilarMessageMatch[]> {
    // Two layers of "only your channels" here, on purpose:
    //   1. RLS on rw_message_embeddings already restricts SELECT to rows
    //      whose message belongs to a channel the caller is a member of.
    //   2. We ALSO join rw_channel_members explicitly in this query.
    // That second layer isn't redundant paranoia for its own sake — it's
    // the exact requirement from the spec ("the copilot must only search
    // vectors in the user's own channels"), made visible in the query
    // instead of depending purely on a DB policy the reader might not see.
    // `<=>` is pgvector's cosine DISTANCE operator; similarity = 1 - distance.
    const { rows } = await this.db.query<MatchRow>(
      `SELECT
         m.id AS message_id,
         m.channel_id,
         m.content,
         u.name AS author_name,
         m.created_at,
         1 - (e.embedding <=> $2::vector) AS similarity
       FROM rw_message_embeddings e
       JOIN rw_messages m ON m.id = e.message_id
       JOIN rw_channel_members cm ON cm.channel_id = m.channel_id AND cm.user_id = $1
       JOIN rw_users u ON u.id = m.user_id
       WHERE m.deleted_at IS NULL
       ORDER BY e.embedding <=> $2::vector
       LIMIT $3`,
      [input.userId, toVectorLiteral(input.queryEmbedding), input.limit]
    );

    return rows.map((row) => ({
      messageId: row.message_id,
      channelId: row.channel_id,
      content: row.content,
      authorName: row.author_name,
      createdAt: row.created_at,
      similarity: Number(row.similarity),
    }));
  }
}

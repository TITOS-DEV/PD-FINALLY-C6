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

/** pgvector quiere su literal como `[0.1,0.2,...]`, no un array de JS. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export class SupabaseMessageEmbeddingRepository implements IMessageEmbeddingRepository {
  constructor(private readonly db: IDbClient) {}

  async upsert(messageId: string, embedding: number[]): Promise<void> {
    // Corre con el contexto de sistema/servicio (ver withSystemContext),
    // calzando con la política `rw_message_embeddings_insert` que es `TO service_role`.
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
    // Dos capas de "solo tus canales" acá, a propósito:
    //   1. El RLS en rw_message_embeddings ya restringe el SELECT a filas
    //      cuyo mensaje pertenece a un canal del que el que llama es miembro.
    //   2. TAMBIÉN hacemos join explícito con rw_channel_members en esta consulta.
    // Esa segunda capa no es paranoia redundante porque sí — es el
    // requerimiento exacto del enunciado ("el copiloto debe buscar
    // vectorialmente SOLO en los canales del usuario"), hecho visible en la
    // consulta en vez de depender solamente de una política de BD que quien
    // lea el código quizás no vea.
    // `<=>` es el operador de DISTANCIA coseno de pgvector; similarity = 1 - distancia.
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

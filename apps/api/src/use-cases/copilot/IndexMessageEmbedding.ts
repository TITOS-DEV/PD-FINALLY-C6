import { IEmbeddingProvider } from "../../domain/providers/ILLMProvider";
import { IMessageEmbeddingRepository } from "../../domain/repositories/IMessageEmbeddingRepository";

export interface IndexMessageEmbeddingInput {
  messageId: string;
  content: string;
}

/**
 * Turns a freshly-sent message into a vector and stores it, so the copilot
 * can find it later. Called right after SendMessage succeeds (see
 * MessageController), wired to the SYSTEM db context because
 * `rw_message_embeddings_insert` is `TO service_role` — a regular
 * authenticated user is never meant to write embeddings directly.
 *
 * Deliberately NOT allowed to fail the whole request: if the embedding
 * provider is down, the message itself was already saved successfully —
 * the copilot just won't find this particular message until indexing is
 * retried. The controller catches and logs errors from this use case
 * instead of letting them bubble up.
 */
export class IndexMessageEmbedding {
  constructor(
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly embeddingRepository: IMessageEmbeddingRepository
  ) {}

  async execute(input: IndexMessageEmbeddingInput): Promise<void> {
    const vector = await this.embeddingProvider.embed(input.content);
    await this.embeddingRepository.upsert(input.messageId, vector);
  }
}

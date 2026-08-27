import { IEmbeddingProvider } from "../../domain/providers/ILLMProvider";
import { IMessageEmbeddingRepository } from "../../domain/repositories/IMessageEmbeddingRepository";

export interface IndexMessageEmbeddingInput {
  messageId: string;
  content: string;
}

/**
 * Convierte un mensaje recién enviado en un vector y lo guarda, para que el
 * copiloto lo pueda encontrar después. Se llama justo después de que
 * SendMessage tiene éxito (ver MessageController), conectado al contexto
 * de sistema de la BD porque `rw_message_embeddings_insert` es `TO
 * service_role` — un usuario autenticado normal nunca debería escribir
 * embeddings directamente.
 *
 * A propósito NO puede tumbar toda la request si falla: si el proveedor de
 * embeddings está caído, el mensaje en sí ya se guardó bien — el copiloto
 * simplemente no va a encontrar ese mensaje puntual hasta que se reintente
 * el indexado. El controller atrapa y loguea los errores de este caso de
 * uso en vez de dejar que se propaguen.
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

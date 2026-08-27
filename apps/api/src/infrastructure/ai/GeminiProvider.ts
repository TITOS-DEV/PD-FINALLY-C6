import { GoogleGenerativeAI } from "@google/generative-ai";
import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { env } from "../config/env";

const SYSTEM_PROMPT = `You are Riwi's internal copilot. Answer the user's question using ONLY the
provided conversation excerpts as context. If the answer isn't in the
excerpts, say you don't have enough information from the channels the user
belongs to — never make things up.

When the excerpts DO contain relevant information, be thorough: synthesize
ALL of the relevant excerpts into a complete answer, not just the single
closest match. If several excerpts touch on different aspects of the
question, cover each of them — don't drop information just to keep the
answer short. It's fine for the answer to be a few sentences or a short
list when the context supports it; being complete matters more than being brief.`;

/**
 * Los mismos dos puertos que OpenAIProvider, pero respaldados por Gemini.
 * Este es todo el sentido de las interfaces ILLMProvider / IEmbeddingProvider:
 * AskCopilot nunca importa este archivo directamente — AIProviderFactory
 * elige cuál usar según AI_PROVIDER, así que cambiar de proveedor es un
 * cambio de configuración, no de código.
 */
export class GeminiProvider implements ILLMProvider, IEmbeddingProvider {
  private readonly client: GoogleGenerativeAI;

  constructor() {
    if (!env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set but AI_PROVIDER=gemini");
    }
    this.client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  }

  async generateAnswer(question: string, contextChunks: string[]): Promise<string> {
    const context = contextChunks.length
      ? contextChunks.map((chunk, i) => `[${i + 1}] ${chunk}`).join("\n")
      : "(no relevant messages were found in the user's channels)";

    const model = this.client.getGenerativeModel({
      model: env.GEMINI_CHAT_MODEL,
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(`Context:\n${context}\n\nQuestion: ${question}`);
    return result.response.text().trim();
  }

  async embed(text: string): Promise<number[]> {
    // ⚠️ Ojo: la columna `rw_message_embeddings.embedding` es un
    // `vector(1536)` fijo (pensado para el text-embedding-3-small de
    // OpenAI). El text-embedding-004 de Gemini da 768 dimensiones. Cambiar
    // el modelo de CHAT siempre es gratis y solo de configuración —
    // cambiar el modelo de EMBEDDINGS NO lo es, porque la dimensión de la
    // columna vectorial está fija en el schema y en el índice HNSW. Hacerlo
    // de verdad implica elegir un modelo de Gemini que dé 1536 dimensiones,
    // rellenar/proyectar el vector, o migrar la columna — ver DECISIONS.md
    // para el trade-off completo.
    const model = this.client.getGenerativeModel({ model: env.GEMINI_EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }
}

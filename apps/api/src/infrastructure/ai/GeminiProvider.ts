import { GoogleGenerativeAI } from "@google/generative-ai";
import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { env } from "../config/env";

const SYSTEM_PROMPT = `You are Riwi's internal copilot. Answer the user's question using ONLY the
provided conversation excerpts as context. If the answer isn't in the
excerpts, say you don't have enough information from the channels the user
belongs to — never make things up. Keep answers short and to the point.`;

/**
 * Same two ports as OpenAIProvider, backed by Gemini instead. This is the
 * whole point of the ILLMProvider / IEmbeddingProvider interfaces: AskCopilot
 * never imports this file directly — AIProviderFactory picks it based on
 * AI_PROVIDER, so swapping providers is a config change, not a code change.
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
    // ⚠️ Heads up: `rw_message_embeddings.embedding` is a fixed `vector(1536)`
    // column (sized for OpenAI's text-embedding-3-small). Gemini's
    // text-embedding-004 outputs 768 dimensions. Swapping the CHAT model is
    // always a free, config-only change — swapping the EMBEDDING model is
    // NOT, because the vector column's dimension is baked into the schema
    // and the HNSW index. Doing it for real means either picking a Gemini
    // model that outputs 1536 dims, padding/projecting the vector, or
    // migrating the column — see DECISIONS.md for the full trade-off.
    const model = this.client.getGenerativeModel({ model: env.GEMINI_EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    return result.embedding.values;
  }
}

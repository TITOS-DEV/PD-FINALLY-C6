import OpenAI from "openai";
import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { env } from "../config/env";

const SYSTEM_PROMPT = `You are Riwi's internal copilot. Answer the user's question using ONLY the
provided conversation excerpts as context. If the answer isn't in the
excerpts, say you don't have enough information from the channels the user
belongs to — never make things up. Keep answers short and to the point.`;

/**
 * Concrete adapter for OpenAI. Implements both ports (chat + embeddings)
 * since one API key covers both here, but nothing stops splitting them
 * into two separate classes if a project ever mixes providers.
 */
export class OpenAIProvider implements ILLMProvider, IEmbeddingProvider {
  private readonly client: OpenAI;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set but AI_PROVIDER=openai");
    }
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generateAnswer(question: string, contextChunks: string[]): Promise<string> {
    const context = contextChunks.length
      ? contextChunks.map((chunk, i) => `[${i + 1}] ${chunk}`).join("\n")
      : "(no relevant messages were found in the user's channels)";

    const completion = await this.client.chat.completions.create({
      model: env.OPENAI_CHAT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Context:\n${context}\n\nQuestion: ${question}` },
      ],
    });

    return completion.choices[0]?.message?.content?.trim() ?? "";
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0]!.embedding;
  }
}

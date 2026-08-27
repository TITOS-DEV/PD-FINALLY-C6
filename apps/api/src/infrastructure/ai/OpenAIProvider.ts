import OpenAI from "openai";
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
 * Adaptador concreto para OpenAI. Implementa los dos puertos (chat +
 * embeddings) porque acá una sola API key cubre ambos, pero nada impide
 * partirlo en dos clases separadas si algún proyecto llega a mezclar proveedores.
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
      // Explícito a propósito: la respuesta por defecto de la API ya
      // alcanzaría, pero preferimos no depender de un default que un
      // cambio de SDK/modelo podría bajar y terminar cortando respuestas a
      // mitad de camino cuando de verdad hay varios mensajes que resumir.
      max_tokens: 600,
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

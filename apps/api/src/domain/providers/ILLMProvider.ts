/**
 * Port for "whatever LLM answers the copilot's questions". AskCopilot only
 * talks to this interface, never to the OpenAI or Gemini SDKs directly.
 * Swapping providers means writing a new adapter in infrastructure/ai and
 * changing one line of config — the use case doesn't change at all.
 */
export interface ILLMProvider {
  /**
   * @param question   The user's raw question.
   * @param contextChunks  Retrieved message snippets (the "R" in RAG) that
   *                       ground the answer in real conversation history.
   */
  generateAnswer(question: string, contextChunks: string[]): Promise<string>;
}

/** Port for turning text into a vector, used both to index messages and to embed the question. */
export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

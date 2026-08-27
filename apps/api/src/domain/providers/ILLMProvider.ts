/**
 * Puerto para "lo que sea que le responda las preguntas al copiloto".
 * AskCopilot solo le habla a esta interfaz, nunca directo a los SDKs de
 * OpenAI o Gemini. Cambiar de proveedor significa escribir un adaptador
 * nuevo en infrastructure/ai y cambiar una línea de configuración — el
 * caso de uso no cambia para nada.
 */
export interface ILLMProvider {
  /**
   * @param question   La pregunta cruda del usuario.
   * @param contextChunks  Fragmentos de mensajes recuperados (la "R" de RAG) que
   *                       anclan la respuesta en el historial real de la conversación.
   */
  generateAnswer(question: string, contextChunks: string[]): Promise<string>;
}

/** Puerto para convertir texto en un vector, usado tanto para indexar mensajes como para la pregunta. */
export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/** Una fuente citada por el copiloto — de qué mensaje real salió el fragmento usado en la respuesta. */
export interface CopilotSource {
  messageId: string;
  channelId: string;
  authorName: string;
  excerpt: string;
  similarity: number;
}

export interface AskCopilotResponse {
  answer: string;
  sources: CopilotSource[];
}

/** Un turno de la conversación con el copiloto, tal como se muestra en el panel. */
export interface CopilotTurn {
  id: string;
  question: string;
  answer: string | null;
  sources: CopilotSource[];
  status: 'pending' | 'answered' | 'failed';
}

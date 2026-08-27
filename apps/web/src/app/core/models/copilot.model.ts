/** Grounding source citation emitted by Copilot backend service. */
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

/** Conversation turn model rendered within `CopilotPanel`. */
export interface CopilotTurn {
  id: string;
  question: string;
  answer: string | null;
  sources: CopilotSource[];
  status: 'pending' | 'answered' | 'failed';
}

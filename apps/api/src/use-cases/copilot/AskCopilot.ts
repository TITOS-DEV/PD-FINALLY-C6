import { IEmbeddingProvider, ILLMProvider } from "../../domain/providers/ILLMProvider";
import { IMessageEmbeddingRepository } from "../../domain/repositories/IMessageEmbeddingRepository";
import { ValidationError } from "../../domain/errors/AppError";

export interface AskCopilotInput {
  userId: string;
  question: string;
}

export interface CopilotSource {
  messageId: string;
  channelId: string;
  authorName: string;
  excerpt: string;
  similarity: number;
}

export interface AskCopilotOutput {
  answer: string;
  sources: CopilotSource[];
}

const MAX_RETRIEVED_MESSAGES = 8;
/** Below this similarity a match is probably noise, not a real answer. Tune per embedding model. */
const MIN_SIMILARITY = 0.75;

/**
 * The RAG (Retrieval-Augmented Generation) flow for the copilot, in three
 * steps:
 *
 *   1. RETRIEVE — turn the question into a vector, then search
 *      `rw_message_embeddings` for the most similar past messages. This is
 *      the "R" in RAG: instead of asking the LLM to answer from thin air,
 *      we hand it real snippets from the actual conversation history.
 *
 *   2. GROUND — keep only matches above MIN_SIMILARITY. This is the
 *      security-critical part of the whole use case: `findSimilarInUserChannels`
 *      is written to only ever search inside channels `userId` belongs to
 *      (join on rw_channel_members), backed AGAIN by the RLS policy on
 *      rw_message_embeddings. A user literally cannot get an answer that
 *      leans on a message from a channel they're not in — the vector
 *      search never sees it in the first place.
 *
 *   3. GENERATE — send the question plus the retrieved snippets to the LLM
 *      and return its answer, along with the sources so the frontend can
 *      show "this came from these messages" instead of a black box.
 *
 * Notice this class never imports OpenAI or Gemini directly — it only
 * knows ILLMProvider / IEmbeddingProvider. Whoever wires this up
 * (container.ts) decides which concrete adapter to inject, based on
 * AI_PROVIDER — that's what makes the LLM swappable without touching this
 * file at all.
 */
export class AskCopilot {
  constructor(
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly llmProvider: ILLMProvider,
    private readonly embeddingRepository: IMessageEmbeddingRepository
  ) {}

  async execute(input: AskCopilotInput): Promise<AskCopilotOutput> {
    const question = input.question.trim();
    if (question.length === 0) throw new ValidationError("Question can't be empty");

    // 1. RETRIEVE
    const questionEmbedding = await this.embeddingProvider.embed(question);
    const matches = await this.embeddingRepository.findSimilarInUserChannels({
      userId: input.userId,
      queryEmbedding: questionEmbedding,
      limit: MAX_RETRIEVED_MESSAGES,
    });

    // 2. GROUND
    const relevantMatches = matches.filter((match) => match.similarity >= MIN_SIMILARITY);

    // 3. GENERATE — even with zero matches we still ask the LLM to answer,
    // but the system prompt tells it to admit it doesn't know rather than
    // hallucinate. An empty `sources` array is the frontend's signal that
    // the answer isn't grounded in anything real.
    const answer = await this.llmProvider.generateAnswer(
      question,
      relevantMatches.map((match) => match.content)
    );

    return {
      answer,
      sources: relevantMatches.map((match) => ({
        messageId: match.messageId,
        channelId: match.channelId,
        authorName: match.authorName,
        excerpt: match.content,
        similarity: match.similarity,
      })),
    };
  }
}

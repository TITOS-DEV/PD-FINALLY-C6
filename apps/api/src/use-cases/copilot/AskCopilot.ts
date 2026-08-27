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

/**
 * How many messages, at most, we hand the LLM as context. Raised from 8 to
 * 16: with only 8, broad questions ("what's been discussed in my
 * channels?") came up short, because the cutoff below was dropping
 * relevant messages that would have easily fit in the model's context
 * window anyway — 16 short chat messages is nothing for a model like
 * gpt-4o-mini, so there's no real reason to be that stingy here.
 */
const MAX_RETRIEVED_MESSAGES = 16;
/**
 * Below this, a match is probably noise, not a real answer. The value is
 * calibrated with real data, not guessed: with `text-embedding-3-small`
 * (short, Spanish, informal chat text), a message genuinely related to the
 * question but worded differently typically lands between 0.4 and 0.6
 * cosine similarity — NOT close to 1, that only happens with near-identical
 * text. A threshold of 0.75 (what used to be here) discarded correct
 * answers all the time: in a real test, the question "what was said about
 * RLS?" scored 0.496 against the actual message about RLS — well above the
 * unrelated messages (0.15–0.29 in that same test) but below 0.75, so the
 * copilot answered "I don't have information" even with the correct answer
 * already indexed. If you switch embedding models, it's worth recalibrating
 * this number with real data instead of blindly copying this same value.
 */
const MIN_SIMILARITY = 0.4;
/**
 * How many "best effort" candidates we fall back to when NONE clear the
 * threshold — see the big comment further down, in step 2, for why this is needed.
 */
const FALLBACK_MATCH_COUNT = 5;

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
    let relevantMatches = matches.filter((match) => match.similarity >= MIN_SIMILARITY);

    // Broad questions ("summarize everything that's been discussed", "what
    // are my channels about?") are a special case: the question itself
    // isn't about any single specific topic, so its embedding doesn't look
    // much like ANY individual message — in a real test, "summarize
    // everything that's been discussed" scored 0.34 against its best
    // candidate (with 14 real messages available to summarize), below the
    // threshold. The problem here isn't a lack of content, it's that cosine
    // similarity just isn't built to measure "how well does this summarize
    // the WHOLE channel". Instead of returning "I don't have information"
    // when there's plenty of messages, we fall back to the best candidates
    // available — they're already ordered by similarity, so "the best we've
    // got" is still the most reasonable approximation we have.
    if (relevantMatches.length === 0 && matches.length > 0) {
      relevantMatches = matches.slice(0, FALLBACK_MATCH_COUNT);
    }

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

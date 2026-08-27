import { describe, expect, it, vi } from "vitest";
import { AskCopilot } from "../../src/use-cases/copilot/AskCopilot";
import { ValidationError } from "../../src/domain/errors/AppError";
import { IEmbeddingProvider, ILLMProvider } from "../../src/domain/providers/ILLMProvider";
import { IMessageEmbeddingRepository } from "../../src/domain/repositories/IMessageEmbeddingRepository";

function buildDeps() {
  const embeddingProvider: IEmbeddingProvider = { embed: vi.fn() };
  const llmProvider: ILLMProvider = { generateAnswer: vi.fn() };
  const embeddingRepository: IMessageEmbeddingRepository = {
    upsert: vi.fn(),
    findSimilarInUserChannels: vi.fn(),
  };
  return { embeddingProvider, llmProvider, embeddingRepository };
}

describe("AskCopilot", () => {
  it("rejects an empty question without calling any provider", async () => {
    const { embeddingProvider, llmProvider, embeddingRepository } = buildDeps();
    const useCase = new AskCopilot(embeddingProvider, llmProvider, embeddingRepository);

    await expect(useCase.execute({ userId: "u1", question: "   " })).rejects.toBeInstanceOf(ValidationError);
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it("only forwards matches at or above the similarity threshold as sources", async () => {
    const { embeddingProvider, llmProvider, embeddingRepository } = buildDeps();
    vi.mocked(embeddingProvider.embed).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(embeddingRepository.findSimilarInUserChannels).mockResolvedValue([
      { messageId: "m1", channelId: "c1", content: "strong match", authorName: "Ana", createdAt: new Date(), similarity: 0.85 },
      { messageId: "m2", channelId: "c1", content: "weak match", authorName: "Ana", createdAt: new Date(), similarity: 0.2 },
    ]);
    vi.mocked(llmProvider.generateAnswer).mockResolvedValue("The answer is X");

    const useCase = new AskCopilot(embeddingProvider, llmProvider, embeddingRepository);
    const result = await useCase.execute({ userId: "u1", question: "what did Ana say?" });

    // The weak match must never reach the LLM as context, nor show up as a
    // "source" that the frontend attributes the answer to.
    expect(llmProvider.generateAnswer).toHaveBeenCalledWith("what did Ana say?", ["strong match"]);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.messageId).toBe("m1");
  });

  it("passes an explicit userId into the vector search so it never leaks other channels", async () => {
    const { embeddingProvider, llmProvider, embeddingRepository } = buildDeps();
    vi.mocked(embeddingProvider.embed).mockResolvedValue([0.5]);
    vi.mocked(embeddingRepository.findSimilarInUserChannels).mockResolvedValue([]);
    vi.mocked(llmProvider.generateAnswer).mockResolvedValue("I don't have enough information");

    const useCase = new AskCopilot(embeddingProvider, llmProvider, embeddingRepository);
    await useCase.execute({ userId: "u42", question: "something" });

    expect(embeddingRepository.findSimilarInUserChannels).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u42" })
    );
  });
});

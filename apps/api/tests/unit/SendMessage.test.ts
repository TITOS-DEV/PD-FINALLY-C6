import { describe, expect, it, vi } from "vitest";
import { SendMessage } from "../../src/use-cases/messages/SendMessage";
import { ForbiddenError, ValidationError } from "../../src/domain/errors/AppError";
import { IMessageRepository } from "../../src/domain/repositories/IMessageRepository";
import { IChannelRepository } from "../../src/domain/repositories/IChannelRepository";

// Unit tests stay at the use-case level and fake the repositories — no
// Postgres, no network, no RLS involved. That's exactly why they run in
// `pnpm test` (fast, no .env needed) while the e2e suite is a separate command.
function buildDeps() {
  const messageRepository: IMessageRepository = {
    create: vi.fn(),
    findByChannel: vi.fn(),
    findById: vi.fn(),
    softDelete: vi.fn(),
    markAsRead: vi.fn(),
  };
  const channelRepository: IChannelRepository = {
    findById: vi.fn(),
    listForUser: vi.fn(),
    isMember: vi.fn(),
    create: vi.fn(),
    addMember: vi.fn(),
  };
  return { messageRepository, channelRepository };
}

describe("SendMessage", () => {
  it("rejects empty content before touching the database", async () => {
    const { messageRepository, channelRepository } = buildDeps();
    const useCase = new SendMessage(messageRepository, channelRepository);

    await expect(
      useCase.execute({ userId: "u1", channelId: "c1", content: "   " })
    ).rejects.toBeInstanceOf(ValidationError);

    expect(channelRepository.isMember).not.toHaveBeenCalled();
  });

  it("rejects when the user isn't a member of the channel", async () => {
    const { messageRepository, channelRepository } = buildDeps();
    vi.mocked(channelRepository.isMember).mockResolvedValue(false);
    const useCase = new SendMessage(messageRepository, channelRepository);

    await expect(
      useCase.execute({ userId: "u1", channelId: "c1", content: "hola equipo" })
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(messageRepository.create).not.toHaveBeenCalled();
  });

  it("trims content and saves the message when the user is a member", async () => {
    const { messageRepository, channelRepository } = buildDeps();
    vi.mocked(channelRepository.isMember).mockResolvedValue(true);
    vi.mocked(messageRepository.create).mockResolvedValue({
      id: "m1",
      channelId: "c1",
      userId: "u1",
      content: "hola equipo",
      status: "sent",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const useCase = new SendMessage(messageRepository, channelRepository);
    const result = await useCase.execute({ userId: "u1", channelId: "c1", content: "  hola equipo  " });

    expect(messageRepository.create).toHaveBeenCalledWith({
      channelId: "c1",
      userId: "u1",
      content: "hola equipo",
    });
    expect(result.content).toBe("hola equipo");
  });
});

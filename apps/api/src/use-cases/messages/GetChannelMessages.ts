import { IMessageRepository } from "../../domain/repositories/IMessageRepository";
import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { Message, MessageCursor } from "../../domain/entities/Message";
import { ForbiddenError } from "../../domain/errors/AppError";

export interface GetChannelMessagesInput {
  userId: string;
  channelId: string;
  cursor?: MessageCursor;
  limit?: number;
}

export interface GetChannelMessagesOutput {
  messages: Message[];
  /** Pass this back as `cursor` to fetch the next (older) page. Null when we've reached the start. */
  nextCursor: MessageCursor | null;
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

export class GetChannelMessages {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly channelRepository: IChannelRepository
  ) {}

  async execute(input: GetChannelMessagesInput): Promise<GetChannelMessagesOutput> {
    const isMember = await this.channelRepository.isMember(input.channelId, input.userId);
    if (!isMember) throw new ForbiddenError("You're not a member of this channel");

    const limit = Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const messages = await this.messageRepository.findByChannel({
      channelId: input.channelId,
      cursor: input.cursor,
      limit,
    });

    // The cursor for the NEXT page is just the (created_at, id) of the last
    // row we returned — that's the whole trick behind keyset pagination.
    const last = messages[messages.length - 1];
    const nextCursor: MessageCursor | null =
      messages.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null;

    return { messages, nextCursor };
  }
}

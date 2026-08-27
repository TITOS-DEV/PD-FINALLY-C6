import { IMessageRepository } from "../../domain/repositories/IMessageRepository";
import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { Message } from "../../domain/entities/Message";
import { ForbiddenError, ValidationError } from "../../domain/errors/AppError";

export interface SendMessageInput {
  userId: string;
  channelId: string;
  content: string;
}

/**
 * Sending a message is guarded twice, on purpose:
 *   1. Here, in the use case: we check membership first so a non-member
 *      gets a clear 403 "you're not in this channel" instead of a
 *      confusing empty result.
 *   2. In Postgres, via the `rw_messages_insert` RLS policy: even if this
 *      check were ever removed or had a bug, the INSERT itself would still
 *      be rejected by the database.
 * That's "defense in depth" — the app layer is for good UX, the DB layer
 * is the actual, unbypassable security boundary.
 */
export class SendMessage {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly channelRepository: IChannelRepository
  ) {}

  async execute(input: SendMessageInput): Promise<Message> {
    const trimmed = input.content.trim();
    if (trimmed.length === 0) throw new ValidationError("Message content can't be empty");

    const isMember = await this.channelRepository.isMember(input.channelId, input.userId);
    if (!isMember) throw new ForbiddenError("You're not a member of this channel");

    return this.messageRepository.create({
      channelId: input.channelId,
      userId: input.userId,
      content: trimmed,
    });
  }
}

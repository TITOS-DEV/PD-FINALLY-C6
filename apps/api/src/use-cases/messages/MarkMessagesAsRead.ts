import { IMessageRepository } from "../../domain/repositories/IMessageRepository";

export interface MarkMessagesAsReadInput {
  userId: string;
  messageIds: string[];
}

/**
 * Records read receipts. No membership check needed here beyond what RLS
 * already guarantees: the INSERT policy on rw_message_read_status only
 * allows `user_id = auth.uid()`, and the repository's SQL already scopes
 * everything to the caller — there's nothing else to validate at this level.
 */
export class MarkMessagesAsRead {
  constructor(private readonly messageRepository: IMessageRepository) {}

  async execute(input: MarkMessagesAsReadInput): Promise<void> {
    await this.messageRepository.markAsRead(input.messageIds, input.userId);
  }
}

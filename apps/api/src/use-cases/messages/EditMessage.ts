import { IMessageRepository } from "../../domain/repositories/IMessageRepository";
import { MessageWithAuthor } from "../../domain/entities/Message";
import { UserRole } from "../../domain/entities/User";
import { ForbiddenError, NotFoundError, ValidationError } from "../../domain/errors/AppError";

export interface EditMessageInput {
  messageId: string;
  userId: string;
  userRole: UserRole;
  content: string;
}

/**
 * Same as SendMessage, authorship is validated twice:
 *   1. Here, so we can return a clear 403 ("you can't edit someone else's
 *      message") instead of the UPDATE simply affecting no rows and
 *      leaving things in a confusing limbo.
 *   2. The `rw_messages_update` RLS policy (user_id = auth.uid() OR
 *      is_admin()) is what actually stops the UPDATE if anyone skips this layer.
 * Admins can edit any message — same criterion the RLS policy already
 * uses, not a new rule invented here.
 */
export class EditMessage {
  constructor(private readonly messageRepository: IMessageRepository) {}

  async execute(input: EditMessageInput): Promise<MessageWithAuthor> {
    const trimmed = input.content.trim();
    if (trimmed.length === 0) throw new ValidationError("Message content can't be empty");

    const existing = await this.messageRepository.findById(input.messageId);
    if (!existing || existing.deletedAt) throw new NotFoundError("Message not found");

    const isOwner = existing.userId === input.userId;
    const isAdmin = input.userRole === "admin";
    if (!isOwner && !isAdmin) throw new ForbiddenError("You can only edit your own messages");

    return this.messageRepository.updateContent(input.messageId, trimmed);
  }
}

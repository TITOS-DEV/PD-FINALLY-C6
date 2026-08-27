import { IMessageRepository } from "../../domain/repositories/IMessageRepository";
import { UserRole } from "../../domain/entities/User";
import { ForbiddenError, NotFoundError } from "../../domain/errors/AppError";

export interface DeleteMessageInput {
  messageId: string;
  userId: string;
  userRole: UserRole;
}

/**
 * Soft delete only — physical DELETE is forbidden for `rw_messages` (see
 * DECISIONS.md). Author or admin can delete, same criterion as the
 * `rw_messages_update` RLS policy (soft delete is, technically, an UPDATE
 * of `deleted_at`).
 */
export class DeleteMessage {
  constructor(private readonly messageRepository: IMessageRepository) {}

  async execute(input: DeleteMessageInput): Promise<{ channelId: string }> {
    const existing = await this.messageRepository.findById(input.messageId);
    if (!existing || existing.deletedAt) throw new NotFoundError("Message not found");

    const isOwner = existing.userId === input.userId;
    const isAdmin = input.userRole === "admin";
    if (!isOwner && !isAdmin) throw new ForbiddenError("You can only delete your own messages");

    await this.messageRepository.softDelete(input.messageId);
    return { channelId: existing.channelId };
  }
}

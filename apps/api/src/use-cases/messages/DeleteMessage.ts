import { IMessageRepository } from "../../domain/repositories/IMessageRepository";
import { UserRole } from "../../domain/entities/User";
import { ForbiddenError, NotFoundError } from "../../domain/errors/AppError";

export interface DeleteMessageInput {
  messageId: string;
  userId: string;
  userRole: UserRole;
}

/**
 * Soft delete solamente — el DELETE físico está prohibido para
 * `rw_messages` (ver DECISIONS.md). Autor o admin pueden borrar, mismo
 * criterio que la política RLS `rw_messages_update` (el soft delete es,
 * técnicamente, un UPDATE de `deleted_at`).
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

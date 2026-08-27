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
 * Igual que con SendMessage, la autoría se valida dos veces:
 *   1. Acá, para poder devolver un 403 claro ("no puedes editar el mensaje
 *      de otra persona") en vez de que el UPDATE simplemente no afecte
 *      ninguna fila y quede en un limbo confuso.
 *   2. La política RLS `rw_messages_update` (user_id = auth.uid() OR
 *      is_admin()) es la que de verdad no deja pasar el UPDATE si alguien
 *      se salta esta capa.
 * Los admins pueden editar cualquier mensaje — mismo criterio que ya usa la
 * política RLS, no es una regla nueva inventada acá.
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

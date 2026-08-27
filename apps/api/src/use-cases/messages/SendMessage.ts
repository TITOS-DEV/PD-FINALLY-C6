import { IMessageRepository } from "../../domain/repositories/IMessageRepository";
import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { MessageWithAuthor } from "../../domain/entities/Message";
import { ForbiddenError, ValidationError } from "../../domain/errors/AppError";

export interface SendMessageInput {
  userId: string;
  channelId: string;
  content: string;
}

/**
 * Enviar un mensaje se cuida por partida doble, a propósito:
 *   1. Acá, en el caso de uso: chequeamos membresía primero para que
 *      alguien que no es miembro reciba un 403 claro de "no perteneces a
 *      este canal" en vez de un resultado confuso.
 *   2. En Postgres, vía la política RLS `rw_messages_insert`: aunque este
 *      chequeo se llegara a borrar o tuviera un bug algún día, el INSERT en
 *      sí igual quedaría rechazado por la base de datos.
 * Eso es "defensa en profundidad" — la capa de app es para una buena
 * experiencia de usuario, la capa de BD es la barrera de seguridad real, imposible de saltar.
 */
export class SendMessage {
  constructor(
    private readonly messageRepository: IMessageRepository,
    private readonly channelRepository: IChannelRepository
  ) {}

  async execute(input: SendMessageInput): Promise<MessageWithAuthor> {
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

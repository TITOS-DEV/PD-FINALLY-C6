import { IMessageRepository } from "../../domain/repositories/IMessageRepository";

export interface MarkMessagesAsReadInput {
  userId: string;
  messageIds: string[];
}

/**
 * Registra confirmaciones de lectura. Acá no hace falta chequear membresía
 * más allá de lo que el RLS ya garantiza: la política de INSERT en
 * rw_message_read_status solo permite `user_id = auth.uid()`, y el SQL del
 * repositorio ya escopea todo a quien llama — no hay nada más que validar en este nivel.
 */
export class MarkMessagesAsRead {
  constructor(private readonly messageRepository: IMessageRepository) {}

  async execute(input: MarkMessagesAsReadInput): Promise<void> {
    await this.messageRepository.markAsRead(input.messageIds, input.userId);
  }
}

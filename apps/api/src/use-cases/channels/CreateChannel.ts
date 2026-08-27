import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { Channel } from "../../domain/entities/Channel";

export interface CreateChannelInput {
  name: string;
  description?: string;
  createdBy: string;
}

export class CreateChannel {
  constructor(private readonly channelRepository: IChannelRepository) {}

  async execute(input: CreateChannelInput): Promise<Channel> {
    const channel = await this.channelRepository.create(input);
    // Sin esto, el creador terminaría dueño de un canal que ni siquiera
    // puede leer — todas las políticas de SELECT en rw_channels/rw_messages
    // exigen membresía, `created_by` solo no da acceso.
    await this.channelRepository.addMember(channel.id, input.createdBy);
    return channel;
  }
}

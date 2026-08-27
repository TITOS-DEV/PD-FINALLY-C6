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
    // Without this, the creator would own a channel they can't even read —
    // every SELECT policy on rw_channels/rw_messages requires membership,
    // `created_by` alone doesn't grant access.
    await this.channelRepository.addMember(channel.id, input.createdBy);
    return channel;
  }
}

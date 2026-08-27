import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { Channel } from "../../domain/entities/Channel";

/** Trivial on purpose — it exists so the controller never talks to a repository directly. */
export class ListMyChannels {
  constructor(private readonly channelRepository: IChannelRepository) {}

  async execute(userId: string): Promise<Channel[]> {
    return this.channelRepository.listForUser(userId);
  }
}

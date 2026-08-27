import { IChannelRepository } from "../../domain/repositories/IChannelRepository";
import { Channel } from "../../domain/entities/Channel";

/** Trivial a propósito — existe para que el controller nunca le hable directo a un repositorio. */
export class ListMyChannels {
  constructor(private readonly channelRepository: IChannelRepository) {}

  async execute(userId: string): Promise<Channel[]> {
    return this.channelRepository.listForUser(userId);
  }
}

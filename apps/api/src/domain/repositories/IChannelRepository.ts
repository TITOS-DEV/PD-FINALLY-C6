import { Channel } from "../entities/Channel";

export interface IChannelRepository {
  findById(id: string): Promise<Channel | null>;
  /** Channels the given user belongs to. RLS already restricts this to the
   *  user's own channels, but the query is explicit anyway (see DECISIONS.md). */
  listForUser(userId: string): Promise<Channel[]>;
  isMember(channelId: string, userId: string): Promise<boolean>;
  create(input: { name: string; description?: string | null; createdBy: string }): Promise<Channel>;
  addMember(channelId: string, userId: string): Promise<void>;
}

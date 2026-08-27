import { Channel } from "../entities/Channel";

export interface IChannelRepository {
  findById(id: string): Promise<Channel | null>;
  /** Canales a los que pertenece el usuario dado. El RLS ya restringe esto a
   *  los canales propios del usuario, pero la consulta igual es explícita (ver DECISIONS.md). */
  listForUser(userId: string): Promise<Channel[]>;
  isMember(channelId: string, userId: string): Promise<boolean>;
  create(input: { name: string; description?: string | null; createdBy: string }): Promise<Channel>;
  addMember(channelId: string, userId: string): Promise<void>;
}

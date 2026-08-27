/** A messaging channel. Mirrors the `rw_channels` table. */
export interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Membership row from `rw_channel_members` (composite PK: channelId + userId). */
export interface ChannelMember {
  channelId: string;
  userId: string;
  joinedAt: Date;
}

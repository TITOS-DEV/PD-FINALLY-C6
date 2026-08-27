/** Un canal de mensajería. Refleja la tabla `rw_channels`. */
export interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Fila de membresía de `rw_channel_members` (PK compuesta: channelId + userId). */
export interface ChannelMember {
  channelId: string;
  userId: string;
  joinedAt: Date;
}

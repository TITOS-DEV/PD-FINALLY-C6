/** Interface matching backend `rw_channels` table schema. */
export interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

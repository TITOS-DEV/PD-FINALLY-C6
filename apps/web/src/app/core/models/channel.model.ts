/** Espejo de la tabla `rw_channels` tal como la sirve el backend. */
export interface Channel {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Espejo del `PublicUser` que devuelve el backend (login/register) — nunca
 * trae el hash de la contraseña, el backend ya se encarga de eso.
 */
export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

import { User } from './user.model';

/** Lo que devuelven /auth/login y /auth/refresh. */
export interface AuthResponse {
  user?: User; // /refresh no devuelve el user de nuevo, solo /login
  accessToken: string;
  refreshToken: string;
}

/** Lo que persistimos en localStorage — ver TokenStorageService. */
export interface StoredSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

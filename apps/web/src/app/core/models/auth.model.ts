import { User } from './user.model';

/** Response interface returned by `/auth/login` and `/auth/refresh`. */
export interface AuthResponse {
  user?: User; // `/refresh` omits user, returned only by `/login`
  accessToken: string;
  refreshToken: string;
}

/** Stored session schema in localStorage (see TokenStorageService). */
export interface StoredSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

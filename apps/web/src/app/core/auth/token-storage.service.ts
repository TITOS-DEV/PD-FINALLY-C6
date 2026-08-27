import { Injectable } from '@angular/core';
import { StoredSession } from '../models/auth.model';

const STORAGE_KEY = 'riwi_session';

/**
 * The only place in the frontend that touches `localStorage` for the
 * session. Everything else (AuthService, the interceptor) talks to this
 * class, never directly to storage — so if we switch to httpOnly cookies
 * or IndexedDB tomorrow, only this file needs to change.
 *
 * We store the whole session (user + both tokens) as a single object
 * instead of three separate keys, so we don't end up with inconsistent
 * state if something fails halfway through saving/clearing.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  load(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      // A corrupted value in localStorage shouldn't crash the whole app on startup.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  save(session: StoredSession): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}

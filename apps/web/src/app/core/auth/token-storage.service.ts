import { Injectable } from '@angular/core';
import { StoredSession } from '../models/auth.model';

const STORAGE_KEY = 'riwi_session';

/**
 * Único lugar del frontend que toca `localStorage` para la sesión. Todo lo
 * demás (AuthService, el interceptor) le habla a esta clase, nunca
 * directo al storage — así, si el día de mañana cambiamos a cookies
 * httpOnly o a IndexedDB, solo se toca este archivo.
 *
 * Guardamos la sesión completa (usuario + los dos tokens) como un solo
 * objeto en vez de tres claves sueltas, para no terminar con un estado
 * inconsistente si algo falla a la mitad de guardar/borrar.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  load(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as StoredSession;
    } catch {
      // Un valor corrupto en localStorage no debería tumbar la app entera al arrancar.
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

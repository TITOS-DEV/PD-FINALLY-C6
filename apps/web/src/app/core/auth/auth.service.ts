import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, StoredSession } from '../models/auth.model';
import { User } from '../models/user.model';
import { TokenStorageService } from './token-storage.service';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Dueño de la sesión del usuario en el frontend. Todo lo que necesita saber
 * "quién soy" o "estoy logueado" le pregunta a este servicio — nunca lee
 * localStorage ni el token directamente.
 *
 * El estado vive en un signal (`_session`), así que `currentUser` e
 * `isAuthenticated` son sencillamente `computed()` sobre esa única fuente
 * de verdad: cambia una vez acá y toda la UI que los usa se actualiza sola,
 * sin necesitar un NgRx store para algo tan chico.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);

  private readonly _session = signal<StoredSession | null>(this.tokenStorage.load());

  readonly currentUser = computed<User | null>(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed<boolean>(() => this._session() !== null);
  readonly accessToken = computed<string | null>(() => this._session()?.accessToken ?? null);

  login(input: LoginInput): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, input).pipe(
      tap((res) => this.setSession(res))
    );
  }

  register(input: RegisterInput): Observable<{ user: User }> {
    return this.http.post<{ user: User }>(`${environment.apiUrl}/auth/register`, input);
  }

  logout(): Observable<void> {
    const refreshToken = this._session()?.refreshToken;
    this.clearSession();
    if (!refreshToken) return new Observable((sub) => sub.complete());
    // Si el logout en el servidor falla (ya expiró, ya se revocó, lo que
    // sea) igual queremos limpiar la sesión local — por eso ya la borramos arriba.
    return this.http.post<void>(`${environment.apiUrl}/auth/logout`, { refreshToken });
  }

  /**
   * Usado únicamente por el interceptor cuando una request responde 401.
   * Reemplaza el par de tokens completo (rotación) y actualiza el usuario
   * guardado si el backend lo manda de vuelta.
   */
  refreshSession(): Observable<AuthResponse> {
    const refreshToken = this._session()?.refreshToken;
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(tap((res) => this.updateTokens(res)));
  }

  getRawRefreshToken(): string | null {
    return this._session()?.refreshToken ?? null;
  }

  private setSession(res: AuthResponse): void {
    if (!res.user) return; // no debería pasar en /login, pero por las dudas
    const session: StoredSession = { user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken };
    this._session.set(session);
    this.tokenStorage.save(session);
  }

  private updateTokens(res: AuthResponse): void {
    const current = this._session();
    if (!current) return;
    const session: StoredSession = {
      user: res.user ?? current.user,
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
    };
    this._session.set(session);
    this.tokenStorage.save(session);
  }

  private clearSession(): void {
    this._session.set(null);
    this.tokenStorage.clear();
  }
}

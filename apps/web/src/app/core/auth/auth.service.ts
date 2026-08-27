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
 * Owner of the user's session in the frontend. Anything that needs to
 * know "who am I" or "am I logged in" asks this service — it never reads
 * localStorage or the token directly.
 *
 * State lives in a signal (`_session`), so `currentUser` and
 * `isAuthenticated` are simply `computed()` over that single source of
 * truth: change it once here and every piece of UI using them updates on
 * its own, no need for an NgRx store for something this small.
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
    // If the server-side logout fails (already expired, already revoked,
    // whatever) we still want to clear the local session — that's why it's already cleared above.
    return this.http.post<void>(`${environment.apiUrl}/auth/logout`, { refreshToken });
  }

  /**
   * Used only by the interceptor when a request responds with 401.
   * Replaces the whole token pair (rotation) and updates the stored user
   * if the backend sends one back.
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
    if (!res.user) return; // shouldn't happen on /login, but just in case
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

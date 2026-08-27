import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Auth endpoints that must NEVER carry the `Authorization` header nor
 * trigger the refresh flow if they respond 401. If /auth/refresh went
 * through this logic, an expired refresh token would trigger a refresh...
 * of the refresh... forever.
 */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/**
 * This pair of variables lives at MODULE level, not inside the
 * interceptor function. A functional interceptor is literally just a
 * function (`HttpInterceptorFn`) that Angular reuses for every request —
 * there's no class instance to hold "state" in. But the file that defines
 * it does load only once, so these top-level variables play the same role
 * a private class property would: shared memory across every call to the
 * interceptor for the whole lifetime of the app.
 *
 * `isRefreshing` stops two (or twenty) requests that fail with 401 at the
 * same time from firing twenty parallel calls to /auth/refresh — which
 * would also BREAK the backend's token rotation, which only allows one
 * active refresh token per user at a time (see DECISIONS.md). Instead,
 * the first request that sees the 401 does the refresh; all the others
 * wait for the result on `refreshedToken$` and retry with the new token
 * as soon as it arrives.
 */
let isRefreshing = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
  const token = authService.accessToken();

  // We attach the Bearer token to every request that isn't an auth one
  // and for which we have an access token to send. Auth requests go
  // without the header (login/register don't even have a session yet;
  // refresh/logout send the refresh token in the body, not the header).
  const authorizedReq =
    !isAuthEndpoint && token ? addAuthHeader(req, token) : req;

  return next(authorizedReq).pipe(
    catchError((error: unknown) => {
      const is401 = error instanceof HttpErrorResponse && error.status === 401;

      if (!is401 || isAuthEndpoint) {
        return throwError(() => error);
      }

      return handleUnauthorized(req, next, authService, router);
    })
  );
};

function addAuthHeader(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * A 401 on a normal (non-auth) request means "your access token already
 * expired". Here we try to renew it once and retry the original request
 * with the new token — all of this is invisible to the component that
 * made the original request, which only sees the final response
 * (successful, or the real error if the refresh also fails).
 */
function handleUnauthorized(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router
): Observable<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshedToken$.next(null); // marks "a refresh is in progress, no result yet"

    return authService.refreshSession().pipe(
      switchMap((res) => {
        isRefreshing = false;
        refreshedToken$.next(res.accessToken);
        return next(addAuthHeader(req, res.accessToken));
      }),
      catchError((refreshError: unknown) => {
        // The refresh token is also expired/revoked — there's no way to
        // recover the session, so we log out and send the user to login.
        isRefreshing = false;
        authService.logout().subscribe();
        router.navigate(['/login']);
        return throwError(() => refreshError);
      })
    );
  }

  // Another request is already doing the refresh — we hook into its
  // result instead of firing a new one. `filter` discards the initial
  // `null` (no result yet) and `take(1)` unhooks us as soon as the first
  // new token arrives, so we don't stay listening forever.
  return refreshedToken$.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap((token) => next(addAuthHeader(req, token)))
  );
}

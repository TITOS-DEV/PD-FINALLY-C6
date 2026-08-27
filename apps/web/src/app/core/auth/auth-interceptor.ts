import { HttpErrorResponse, HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, switchMap, take, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Endpoints de auth que NUNCA deben llevar el `Authorization` header ni
 * disparar el flujo de refresh si responden 401. Si /auth/refresh entrara
 * en esta lógica, un refresh token vencido dispararía un refresh... del
 * refresh... para siempre.
 */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

/**
 * Este par de variables vive a nivel de MÓDULO, no dentro de la función del
 * interceptor. Un interceptor funcional es literalmente solo una función
 * (`HttpInterceptorFn`) que Angular reutiliza para cada request — no hay
 * una instancia de clase donde guardar "estado". Pero el archivo que la
 * define sí se carga una sola vez, así que estas variables de acá arriba
 * cumplen el mismo rol que haría una propiedad privada en una clase:
 * memoria compartida entre todas las llamadas al interceptor durante toda
 * la vida de la app.
 *
 * `isRefreshing` evita que dos (o veinte) requests que fallan con 401 al
 * mismo tiempo disparen veinte llamadas a /auth/refresh en paralelo — cosa
 * que además ROMPERÍA la rotación de tokens del backend, que solo permite
 * un refresh token activo por usuario a la vez (ver DECISIONS.md). En vez
 * de eso, la primera request que ve el 401 hace el refresh; todas las
 * demás esperan el resultado en `refreshedToken$` y reintentan con el
 * token nuevo apenas llega.
 */
let isRefreshing = false;
const refreshedToken$ = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
  const token = authService.accessToken();

  // Le pegamos el Bearer token a toda request que no sea de auth y que
  // tengamos un access token para mandar. Las de auth van sin header
  // (login/register ni siquiera tienen sesión todavía; refresh/logout
  // mandan el refresh token en el body, no en el header).
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
 * Un 401 en una request normal (no de auth) significa "tu access token ya
 * expiró". Acá intentamos renovarlo una sola vez y reintentar la request
 * original con el token nuevo — todo esto es invisible para el componente
 * que hizo la request original, que solo ve la respuesta final (exitosa o
 * el error real si el refresh también falla).
 */
function handleUnauthorized(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router
): Observable<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshedToken$.next(null); // marca "hay un refresh en curso, todavía sin resultado"

    return authService.refreshSession().pipe(
      switchMap((res) => {
        isRefreshing = false;
        refreshedToken$.next(res.accessToken);
        return next(addAuthHeader(req, res.accessToken));
      }),
      catchError((refreshError: unknown) => {
        // El refresh token también está vencido/revocado — no hay forma de
        // recuperar la sesión, así que cerramos sesión y mandamos al login.
        isRefreshing = false;
        authService.logout().subscribe();
        router.navigate(['/login']);
        return throwError(() => refreshError);
      })
    );
  }

  // Ya hay otra request haciendo el refresh — nos enganchamos a su
  // resultado en vez de disparar uno nuevo. `filter` descarta el `null`
  // inicial (todavía sin resultado) y `take(1)` nos desengancha apenas
  // llega el primer token nuevo, para no quedar escuchando para siempre.
  return refreshedToken$.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap((token) => next(addAuthHeader(req, token)))
  );
}

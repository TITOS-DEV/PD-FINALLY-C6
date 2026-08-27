import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guardia funcional de rutas: si no hay sesión, redirige a /login en vez de
 * dejar entrar. Se usa en app.routes.ts en las rutas que necesitan usuario logueado.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) return true;

  return router.createUrlTree(['/login']);
};

/** El inverso: si YA hay sesión, no tiene sentido mostrar la pantalla de login de nuevo. */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) return true;

  return router.createUrlTree(['/']);
};

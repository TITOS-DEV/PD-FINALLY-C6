import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Functional route guard: if there's no session, redirect to /login
 * instead of letting the user in. Used in app.routes.ts on routes that need a logged-in user.
 */
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) return true;

  return router.createUrlTree(['/login']);
};

/** The reverse: if there's ALREADY a session, there's no point showing the login screen again. */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) return true;

  return router.createUrlTree(['/']);
};

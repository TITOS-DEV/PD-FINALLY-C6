/**
 * Configuration for production builds (`ng build`). Angular
 * replaces this file with `environment.development.ts` in development
 * via `fileReplacements` in angular.json — environment resolution is handled at build time.
 *
 * In production, the API typically resides behind the same domain/reverse proxy
 * serving the frontend, so `apiUrl`/`wsUrl` use relative paths instead of absolute localhost URLs.
 */
export const environment = {
  production: true,
  apiUrl: "/api",
  wsUrl: "/",
  defaultLang: "es" as const,
};

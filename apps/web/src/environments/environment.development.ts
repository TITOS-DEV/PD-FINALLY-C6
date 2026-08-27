/**
 * Configuration for local development (`ng serve` / `npm start`). Points
 * directly to the `apps/api` backend running on port 4000 (see the
 * README in the monorepo root for setup instructions).
 */
export const environment = {
  production: false,
  apiUrl: "http://localhost:4000/api",
  wsUrl: "http://localhost:4000",
  defaultLang: "es" as const,
};

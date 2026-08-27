/**
 * Configuración para desarrollo local (`ng serve` / `npm start`). Apunta
 * directo al backend de `apps/api` corriendo en el puerto 4000 (ver el
 * README de la raíz del monorepo para levantarlo).
 */
export const environment = {
  production: false,
  apiUrl: "http://localhost:4000/api",
  wsUrl: "http://localhost:4000",
  defaultLang: "es" as const,
};

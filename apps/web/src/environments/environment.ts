/**
 * Configuración para el build de producción (`ng build`). Angular
 * reemplaza este archivo por `environment.development.ts` en desarrollo
 * gracias al `fileReplacements` de angular.json — no hay lógica de
 * "detectar el entorno" en tiempo de ejecución, todo se resuelve en build time.
 *
 * En producción, la API normalmente queda detrás del mismo dominio/reverse
 * proxy que sirve el frontend, por eso `apiUrl`/`wsUrl` acá son rutas
 * relativas en vez de una URL absoluta a `localhost`.
 */
export const environment = {
  production: true,
  apiUrl: "/api",
  wsUrl: "/",
  defaultLang: "es" as const,
};

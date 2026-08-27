/**
 * `unique_violation` — el código de error estándar de Postgres (no algo
 * específico de `pg`) para cuando un INSERT choca contra una restricción
 * única. Lo usamos para detectar cuándo dos requests concurrentes
 * chocaron contra `idx_rw_active_refresh_token_unique` y vale la pena
 * reintentar, en vez de tratarlo como un error genérico de base de datos.
 */
const UNIQUE_VIOLATION_CODE = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION_CODE
  );
}

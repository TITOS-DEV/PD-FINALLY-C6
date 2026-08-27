/**
 * `unique_violation` — Postgres's standard error code (nothing specific to
 * `pg`) for when an INSERT collides with a unique constraint. We use it to
 * detect when two concurrent requests collided against
 * `idx_rw_active_refresh_token_unique` and it's worth retrying, instead of
 * treating it as a generic database error.
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

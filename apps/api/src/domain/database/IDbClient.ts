/**
 * Minimal shape of a database client that repositories depend on.
 *
 * We deliberately don't import anything from `pg` here — the domain layer
 * shouldn't know which driver is behind it. In infrastructure, a real
 * `pg.PoolClient` (already scoped to the authenticated user, see
 * `withRLSContext.ts`) satisfies this interface without any wrapping.
 */
export interface IDbClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
}

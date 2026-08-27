/**
 * Forma mínima que necesita un cliente de base de datos para que los
 * repositorios dependan de ella.
 *
 * A propósito no importamos nada de `pg` acá — la capa de dominio no debería
 * saber qué driver hay detrás. En infrastructure, un `pg.PoolClient` real
 * (ya escopeado al usuario autenticado, ver `withRLSContext.ts`) cumple esta
 * interfaz sin necesitar ningún wrapper.
 */
export interface IDbClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
}

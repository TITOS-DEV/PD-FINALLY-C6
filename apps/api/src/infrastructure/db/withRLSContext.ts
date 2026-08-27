import { PoolClient } from "pg";
import { pool } from "./pool";
import { IDbClient } from "../../domain/database/IDbClient";

/**
 * Esta es la pieza que hace que el Row Level Security funcione de verdad
 * con NUESTROS PROPIOS JWT en vez del Auth nativo de Supabase (GoTrue).
 *
 * Contexto: en un setup normal de Supabase, las requests pasan por
 * PostgREST, que lee el JWT y, por cada consulta, corre:
 *
 *   SET LOCAL request.jwt.claims = '{"sub": "<id-del-usuario>", "role": "authenticated"}';
 *   SET LOCAL ROLE authenticated;
 *
 * Eso es exactamente lo que desbloquea `auth.uid()` dentro de las políticas
 * RLS (es solo una función SQL que lee esa variable de sesión). Como
 * emitimos nuestros propios access tokens en vez de pasar por GoTrue, nadie
 * nos setea esas variables — así que lo hacemos nosotros mismos, a mano,
 * en cada request autenticado, envuelto en una transacción para que nunca
 * se filtre a otra request que comparta la misma conexión pooleada.
 *
 * El pool de `pg` en sí se conecta como un rol con privilegios (el usuario
 * "postgres" de Supabase), que es justo lo que hace posible el `SET LOCAL
 * ROLE authenticated` — solo puedes cambiarte a un rol del que seas
 * miembro. Nos auto-degradamos a propósito, en cada request, para que un
 * bug en nuestro propio código NUNCA pueda saltarse el RLS por accidente.
 */
export async function withRLSContext<T>(
  userId: string,
  work: (db: IDbClient) => Promise<T>
): Promise<T> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    // `set_config(..., true)` con `true` al final significa "local a la
    // transacción": se resetea solo en el COMMIT/ROLLBACK, así que nunca
    // puede filtrarse a lo que haga la próxima request en esta misma conexión pooleada.
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: userId, role: "authenticated" })]
    );
    await client.query("SET LOCAL ROLE authenticated");

    const result = await work(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
      // Si el ROLLBACK mismo falla, la conexión ya está muerta; liberarla
      // abajo marcada como error hace que `pg` la destruya en vez de
      // devolver al pool un cliente posiblemente corrupto.
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * La misma idea, pero para trabajo de sistema/background que no está atado
 * a un usuario final específico (ej. generar un embedding justo después de
 * guardar un mensaje). Corre como el rol privilegiado del pool, que es
 * exactamente lo que espera la política `rw_message_embeddings_insert`
 * (`TO service_role`).
 *
 * Lo dejo separado de withRLSContext a propósito: usar esta función debería
 * ser siempre una decisión deliberada, nunca un accidente.
 */
export async function withSystemContext<T>(work: (db: IDbClient) => Promise<T>): Promise<T> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

import { PoolClient } from "pg";
import { pool } from "./pool";
import { IDbClient } from "../../domain/database/IDbClient";

/**
 * This is the piece that makes Row Level Security actually work with our
 * OWN JWTs instead of Supabase's built-in auth (GoTrue).
 *
 * Background: in a normal Supabase setup, requests go through PostgREST,
 * which reads the JWT, and — for every query — runs:
 *
 *   SET LOCAL request.jwt.claims = '{"sub": "<user-id>", "role": "authenticated"}';
 *   SET LOCAL ROLE authenticated;
 *
 * That's exactly what unlocks `auth.uid()` inside RLS policies (it's just a
 * SQL function reading that session variable). Since we're issuing our own
 * access tokens instead of going through GoTrue, nobody sets those
 * variables for us — so we do it ourselves, by hand, for every authenticated
 * request, wrapped in a transaction so it never leaks into another request
 * sharing the same pooled connection.
 *
 * The `pg` pool itself connects as a privileged role (the Supabase
 * "postgres" user), which is what makes `SET LOCAL ROLE authenticated`
 * possible in the first place — you can only switch into a role you're a
 * member of. We downgrade on purpose, on every request, so a bug in our own
 * code can *never* skip RLS by accident.
 */
export async function withRLSContext<T>(
  userId: string,
  work: (db: IDbClient) => Promise<T>
): Promise<T> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    // `set_config(..., true)` with `true` at the end means "transaction-local":
    // it's automatically reset at COMMIT/ROLLBACK, so it can never bleed into
    // whatever the next request on this pooled connection does.
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
      // If ROLLBACK itself fails the connection is already dead; releasing
      // it below with an error flag makes `pg` destroy it instead of
      // returning a possibly-corrupted client to the pool.
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Same idea, but for background/system work that isn't tied to a specific
 * end user (e.g. generating an embedding right after a message is saved).
 * Runs as the privileged pool role, which is exactly what the
 * `rw_message_embeddings_insert` policy expects (`TO service_role`).
 *
 * Kept separate from withRLSContext on purpose: reaching for this one
 * should always be a deliberate choice, not an accident.
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

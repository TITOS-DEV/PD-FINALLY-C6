import { Pool } from "pg";
import { env } from "../config/env";

/**
 * The one and only connection pool for the whole process.
 *
 * IMPORTANT: this connects straight to Postgres (Supabase's "Connection
 * string", not the supabase-js REST client). We need a raw `pg` connection
 * because Row Level Security is enforced per-transaction by setting session
 * variables (`request.jwt.claims`, `role`) — something the supabase-js
 * client doesn't let us do, since it always talks through PostgREST using
 * either the anon key or the service_role key (which bypasses RLS
 * entirely). See withRLSContext.ts for how those variables get set.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Supabase's pooled connection strings require SSL; rejectUnauthorized:false
  // is the standard setting for their managed certs when not pinning a CA bundle.
  ssl: env.NODE_ENV === "production" || env.DATABASE_URL.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // A broken idle client shouldn't crash the whole process — just log it.
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle Postgres client", err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}

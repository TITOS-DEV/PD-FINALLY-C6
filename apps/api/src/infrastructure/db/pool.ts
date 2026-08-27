import { Pool } from "pg";
import { env } from "../config/env";

/**
 * El único pool de conexiones para todo el proceso.
 *
 * IMPORTANTE: esto se conecta directo a Postgres (el "Connection string" de
 * Supabase, no el cliente REST de supabase-js). Necesitamos una conexión
 * `pg` cruda porque el Row Level Security se activa por transacción,
 * seteando variables de sesión (`request.jwt.claims`, `role`) — algo que el
 * cliente de supabase-js no nos deja hacer, porque siempre habla a través
 * de PostgREST usando la `anon key` o la `service_role key` (esta última se
 * salta el RLS por completo). Ver withRLSContext.ts para cómo se setean esas variables.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Los connection strings del pool de Supabase requieren SSL;
  // rejectUnauthorized:false es la configuración estándar para sus
  // certificados administrados cuando no fijas un bundle de CA propio.
  ssl: env.NODE_ENV === "production" || env.DATABASE_URL.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  // Un cliente idle roto no debería tumbar todo el proceso — solo lo logueamos.
  // eslint-disable-next-line no-console
  console.error("Unexpected error on idle Postgres client", err);
});

export async function closePool(): Promise<void> {
  await pool.end();
}

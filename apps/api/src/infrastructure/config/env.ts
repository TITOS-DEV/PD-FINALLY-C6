import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// Soportamos correr la API de dos formas: directo desde `apps/api` (el
// `pnpm dev` local) o desde la raíz del monorepo dentro de Docker
// (`WORKDIR /app`, `CMD node apps/api/dist/server.js`). En los dos casos
// terminamos necesitando el mismo `.env` único en la raíz del repo, así que
// simplemente probamos las dos ubicaciones. `dotenv` nunca sobreescribe una
// variable que ya está seteada, así que cargarlo dos veces no hace daño.
dotenv.config(); // CWD/.env (cubre el caso de Docker, donde CWD === raíz del repo)
dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") }); // raíz del repo, relativo a este archivo

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Connection string directo de Postgres (el "Connection string" de
  // Supabase, en Project Settings > Database). A propósito NO es la URL de
  // supabase-js / REST: necesitamos una conexión `pg` cruda para poder abrir
  // una transacción y setear nosotros mismos los claims del JWT — ver
  // withRLSContext.ts para el porqué.
  DATABASE_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  AI_PROVIDER: z.enum(["openai", "gemini"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().default("gemini-1.5-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),

  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Falla rápido y fuerte: un servidor mal configurado es peor que uno que
  // se niega a arrancar. `flatten()` da un resumen legible campo por campo.
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

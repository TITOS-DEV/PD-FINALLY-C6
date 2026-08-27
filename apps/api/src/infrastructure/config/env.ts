import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// We support running the API two ways: straight from `apps/api` (local
// `pnpm dev`) or from the monorepo root inside Docker (`WORKDIR /app`,
// `CMD node apps/api/dist/server.js`). Both cases end up needing the same
// single `.env` file at the repo root, so we just try both locations.
// `dotenv` never overwrites a variable that's already set, so loading it
// twice is harmless.
dotenv.config(); // CWD/.env (covers the Docker case, CWD === repo root)
dotenv.config({ path: path.resolve(__dirname, "../../../../../.env") }); // repo root, relative to this file

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Direct Postgres connection string (Supabase "Connection string" from
  // Project Settings > Database). Deliberately NOT the supabase-js / REST
  // URL: we need a raw `pg` connection so we can open a transaction and set
  // the JWT claims ourselves — see withRLSContext.ts for why.
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
  // Fail fast and loud: a misconfigured server is worse than one that
  // refuses to boot. `flatten()` gives a readable field-by-field summary.
  console.error("❌ Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

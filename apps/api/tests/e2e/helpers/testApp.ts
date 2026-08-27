import { createApp } from "../../../src/presentation/app";

/**
 * The e2e tests reuse the exact same `createApp()` that boots the real
 * server (see src/server.ts) — no test-only Express setup that could drift
 * out of sync with production. supertest drives it directly over
 * in-memory HTTP, no open port needed.
 */
export const app = createApp();

/** Credentials from database/seeds/seed.sql — every seeded user shares this password. */
export const SEED_PASSWORD = "Password123!";
export const SEED_USERS = {
  admin: { email: "admin@riwi.io" },
  jhonatan: { email: "jhonatan@riwi.io" },
  sofia: { email: "sofia@riwi.io" },
};

/** a1111111... = "General" (admin, jhonatan, sofia). b2222222... = "Desarrollo Cohorte 6" (jhonatan and sofia only). */
export const SEED_CHANNELS = {
  general: "a1111111-1111-1111-1111-111111111111",
  devCohorte6: "b2222222-2222-2222-2222-222222222222",
};

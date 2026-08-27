import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Unit tests never touch the network; e2e tests hit the real Supabase
    // Postgres instance configured in .env, so we give them more breathing room.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    globals: false,
  },
});

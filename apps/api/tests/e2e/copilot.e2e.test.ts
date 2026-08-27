import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, SEED_PASSWORD, SEED_USERS } from "./helpers/testApp";

// This one costs real API calls, so it only runs when a key is actually
// configured — CI without secrets, or a dev without OPENAI_API_KEY set,
// just skips it instead of failing the whole suite.
describe.skipIf(!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY)("Copilot (e2e)", () => {
  it("answers using only messages from the user's own channels", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: SEED_USERS.jhonatan.email, password: SEED_PASSWORD });

    const res = await request(app)
      .post("/api/copilot/ask")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ question: "¿Qué se dijo sobre seguridad y RLS?" });

    expect(res.status).toBe(200);
    expect(typeof res.body.answer).toBe("string");
    expect(Array.isArray(res.body.sources)).toBe(true);
  });
});

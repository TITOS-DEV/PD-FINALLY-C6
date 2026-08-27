import { describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, SEED_PASSWORD, SEED_USERS } from "./helpers/testApp";

/**
 * Estas pruebas le pegan al Postgres de Supabase REAL configurado en
 * .env — no hay una base de datos de prueba local. Se corren con
 * `pnpm test:e2e`. Cada prueba o usa las cuentas sembradas (ver
 * database/seeds/seed.sql) o crea su propio usuario descartable con un
 * email random, para que las corridas no choquen entre sí.
 */
describe("Auth flow (e2e)", () => {
  it("logs in with a seeded account and gets a token pair", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: SEED_USERS.jhonatan.email, password: SEED_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(SEED_USERS.jhonatan.email);
    expect(res.body.user.passwordHash).toBeUndefined(); // nunca se filtra el hash
  });

  it("rejects a wrong password with a generic message", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: SEED_USERS.jhonatan.email, password: "not-the-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("registers, logs in, and can call a protected route with the access token", async () => {
    const email = `test-${randomUUID()}@riwi.io`;

    const register = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email, password: SEED_PASSWORD });
    expect(register.status).toBe(201);

    const login = await request(app).post("/api/auth/login").send({ email, password: SEED_PASSWORD });
    expect(login.status).toBe(200);

    const channels = await request(app)
      .get("/api/channels")
      .set("Authorization", `Bearer ${login.body.accessToken}`);
    expect(channels.status).toBe(200);
    expect(channels.body.channels).toEqual([]); // usuario recién creado, todavía sin membresías
  });

  it("rotates the refresh token and rejects the old one on reuse", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: SEED_USERS.sofia.email, password: SEED_PASSWORD });
    const firstRefreshToken = login.body.refreshToken as string;

    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(firstRefreshToken);

    // Reusar el token que ya se rotó tiene que fallar — esta es la mitad de
    // "detección de reuso" de la estrategia de rotación.
    const replay = await request(app).post("/api/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(replay.status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: SEED_USERS.admin.email, password: SEED_PASSWORD });

    const logout = await request(app).post("/api/auth/logout").send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(204);

    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
  });

  it("rejects a protected route with no token at all", async () => {
    const res = await request(app).get("/api/channels");
    expect(res.status).toBe(401);
  });
});

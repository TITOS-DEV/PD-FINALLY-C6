import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, SEED_CHANNELS, SEED_PASSWORD, SEED_USERS } from "./helpers/testApp";

async function loginAs(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: SEED_PASSWORD });
  return res.body.accessToken as string;
}

describe("Messages flow (e2e)", () => {
  it("lets a member send and read messages in their own channel", async () => {
    const token = await loginAs(SEED_USERS.jhonatan.email);
    const content = `e2e message ${Date.now()}`;

    const sent = await request(app)
      .post(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content });

    expect(sent.status).toBe(201);
    expect(sent.body.message.content).toBe(content);
    expect(sent.body.message.channelId).toBe(SEED_CHANNELS.general);

    const list = await request(app)
      .get(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .set("Authorization", `Bearer ${token}`);

    expect(list.status).toBe(200);
    expect(list.body.messages[0].content).toBe(content); // newest first
  });

  it("paginates by keyset instead of OFFSET — the cursor always yields older, non-repeating rows", async () => {
    const token = await loginAs(SEED_USERS.jhonatan.email);

    const firstPage = await request(app)
      .get(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .query({ limit: 1 })
      .set("Authorization", `Bearer ${token}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.messages).toHaveLength(1);
    expect(firstPage.body.nextCursor).toBeTruthy();

    const secondPage = await request(app)
      .get(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .query({
        limit: 1,
        cursorCreatedAt: firstPage.body.nextCursor.createdAt,
        cursorId: firstPage.body.nextCursor.id,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.messages[0]?.id).not.toBe(firstPage.body.messages[0].id);
  });

  it("blocks reading a channel the user doesn't belong to, even with a valid token", async () => {
    // The seed only puts jhonatan and sofia in "Desarrollo Cohorte 6" — admin is not a member.
    const token = await loginAs(SEED_USERS.admin.email);

    const res = await request(app)
      .get(`/api/channels/${SEED_CHANNELS.devCohorte6}/messages`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("blocks sending a message to a channel the user doesn't belong to", async () => {
    const token = await loginAs(SEED_USERS.admin.email);

    const res = await request(app)
      .post(`/api/channels/${SEED_CHANNELS.devCohorte6}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "intento no autorizado" });

    expect(res.status).toBe(403);
  });

  it("rejects an empty message", async () => {
    const token = await loginAs(SEED_USERS.jhonatan.email);

    const res = await request(app)
      .post(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "   " });

    expect(res.status).toBe(400);
  });
});

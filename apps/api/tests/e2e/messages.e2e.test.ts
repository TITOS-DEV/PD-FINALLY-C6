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
    expect(list.body.messages[0].content).toBe(content); // el más nuevo primero
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
    // El seed solo pone a jhonatan y sofia en "Desarrollo Cohorte 6" — admin no es miembro.
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

  it("lets the author edit their own message, but nobody else", async () => {
    const authorToken = await loginAs(SEED_USERS.jhonatan.email);
    const otherToken = await loginAs(SEED_USERS.sofia.email);

    const sent = await request(app)
      .post(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ content: "original" });
    const messageId = sent.body.message.id as string;

    const blocked = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ content: "hackeado" });
    expect(blocked.status).toBe(403);

    const edited = await request(app)
      .patch(`/api/messages/${messageId}`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ content: "editado" });
    expect(edited.status).toBe(200);
    expect(edited.body.message.content).toBe("editado");
    // updatedAt tiene que moverse — es lo que el frontend usa para mostrar "(editado)".
    expect(edited.body.message.updatedAt).not.toBe(sent.body.message.updatedAt);
  });

  it("lets the author soft-delete their own message, and it disappears from the history", async () => {
    const authorToken = await loginAs(SEED_USERS.jhonatan.email);
    const otherToken = await loginAs(SEED_USERS.sofia.email);

    const sent = await request(app)
      .post(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ content: `para borrar ${Date.now()}` });
    const messageId = sent.body.message.id as string;

    const blocked = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(blocked.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/messages/${messageId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(deleted.status).toBe(204);

    const list = await request(app)
      .get(`/api/channels/${SEED_CHANNELS.general}/messages`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(list.body.messages.some((m: { id: string }) => m.id === messageId)).toBe(false);
  });
});

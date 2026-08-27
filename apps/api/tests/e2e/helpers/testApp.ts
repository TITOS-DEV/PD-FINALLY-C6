import { createApp } from "../../../src/presentation/app";

/**
 * Los tests e2e reusan el mismo `createApp()` con el que arranca el
 * servidor de verdad (ver src/server.ts) — nada de un setup de Express
 * hecho solo para pruebas que se pueda ir desalineando de producción.
 * supertest lo maneja directo por HTTP-en-memoria, sin necesitar un puerto abierto.
 */
export const app = createApp();

/** Credenciales de database/seeds/seed.sql — todos los usuarios sembrados comparten esta contraseña. */
export const SEED_PASSWORD = "Password123!";
export const SEED_USERS = {
  admin: { email: "admin@riwi.io" },
  jhonatan: { email: "jhonatan@riwi.io" },
  sofia: { email: "sofia@riwi.io" },
};

/** a1111111... = "General" (admin, jhonatan, sofia). b2222222... = "Desarrollo Cohorte 6" (solo jhonatan y sofia). */
export const SEED_CHANNELS = {
  general: "a1111111-1111-1111-1111-111111111111",
  devCohorte6: "b2222222-2222-2222-2222-222222222222",
};

import pino from "pino";
import { env } from "../config/env";

/**
 * Single structured logger for the whole app. In development it prints
 * readable colored lines; in production it prints plain JSON so it can be
 * shipped to any log aggregator without extra parsing.
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
});

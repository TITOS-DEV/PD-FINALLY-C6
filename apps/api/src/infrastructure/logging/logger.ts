import pino from "pino";
import { env } from "../config/env";

/**
 * Logger estructurado único para toda la app. En desarrollo imprime líneas
 * legibles y con color; en producción imprime JSON plano para que se pueda
 * mandar a cualquier agregador de logs sin necesitar parseo extra.
 */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
});

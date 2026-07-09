import pino from "pino";
import { config } from "../../config/index";

export const logger = pino({
  name: "lilly-os",
  level: config.logLevel,
  transport:
    config.isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    service: "lilly-os",
    env: config.env,
  },
});

export function childLogger(module: string) {
  return logger.child({ module });
}

export type Logger = ReturnType<typeof childLogger>;

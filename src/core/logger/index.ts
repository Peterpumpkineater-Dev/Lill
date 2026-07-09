import pino from "pino";
import { config } from "../../config/index";

/**
 * Production: plain JSON logs (no pino-pretty dependency).
 * Local pretty: set LOG_PRETTY=true (requires pino-pretty in devDependencies).
 */
export const logger = pino({
  name: "lilly-os",
  level: config.logLevel,
  ...(config.logPretty
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
  base: {
    service: "lilly-os",
    env: config.env,
  },
});

export function childLogger(module: string) {
  return logger.child({ module });
}

export type Logger = ReturnType<typeof childLogger>;

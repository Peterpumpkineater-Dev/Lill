import type Redis from "ioredis";
import { checkDb } from "../db/pool";
import { validateInfraEnv } from "./env-validation";

export type HealthReport = {
  status: "ok" | "degraded" | "setup" | "down";
  server: { ok: true; uptimeSeconds: number; listenPort: number | null };
  postgres: { ok: boolean; configured: boolean; error?: string };
  redis: { ok: boolean; configured: boolean; error?: string };
  env: {
    missing: string[];
    errors: string[];
    hints: string[];
    production: boolean;
  };
  version: string;
  talk: string;
};

export async function buildHealthReport(opts?: {
  redis?: Redis | null;
  listenPort?: number | null;
}): Promise<HealthReport> {
  const infra = validateInfraEnv();
  const listenPort =
    opts?.listenPort ??
    (process.env.PORT ? Number(process.env.PORT) : null);

  let pgOk = false;
  let pgError: string | undefined;
  if (infra.databaseUrl || process.env.DATABASE_URL) {
    try {
      pgOk = await checkDb();
      if (!pgOk) pgError = "SELECT 1 failed — check DATABASE_URL and SSL";
    } catch (err) {
      pgOk = false;
      pgError = err instanceof Error ? err.message : String(err);
    }
  } else {
    pgError = "DATABASE_URL not set";
  }

  let redisOk = false;
  let redisError: string | undefined;
  const redisConfigured = Boolean(
    process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL
  );
  if (opts?.redis) {
    try {
      redisOk = (await opts.redis.ping()) === "PONG";
      if (!redisOk) redisError = "PING failed";
    } catch (err) {
      redisError = err instanceof Error ? err.message : String(err);
    }
  } else if (redisConfigured) {
    // Try a one-shot connection for health when no shared client
    try {
      const Redis = (await import("ioredis")).default;
      const url = process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || "";
      if (url.includes("localhost") && infra.production) {
        redisError =
          "REDIS_URL is localhost — use Railway Redis reference, not redis://localhost:6379";
      } else {
        const client = new Redis(url, {
          maxRetriesPerRequest: 1,
          connectTimeout: 5000,
          lazyConnect: true,
        });
        await client.connect();
        redisOk = (await client.ping()) === "PONG";
        client.disconnect();
      }
    } catch (err) {
      redisError = err instanceof Error ? err.message : String(err);
    }
  } else {
    redisError = "REDIS_URL not set";
  }

  const bothOk = pgOk && redisOk;
  let status: HealthReport["status"] = "ok";
  if (!bothOk && (pgOk || redisOk)) status = "degraded";
  if (!pgOk && !redisOk) {
    status = infra.production ? "down" : "setup";
  }
  if (bothOk) status = "ok";

  return {
    status,
    server: {
      ok: true,
      uptimeSeconds: Math.floor(process.uptime()),
      listenPort,
    },
    postgres: {
      ok: pgOk,
      configured: Boolean(process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL),
      error: pgError,
    },
    redis: {
      ok: redisOk,
      configured: redisConfigured,
      error: redisError,
    },
    env: {
      missing: infra.missing,
      errors: infra.errors,
      hints: infra.hints,
      production: infra.production,
    },
    version: "1.4.0",
    talk: "/chat",
  };
}

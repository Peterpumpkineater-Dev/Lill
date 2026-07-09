import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/** Railway often injects REDIS_URL or REDIS_PRIVATE_URL */
function resolveRedisUrl(): string {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  if (process.env.REDIS_PRIVATE_URL) return process.env.REDIS_PRIVATE_URL;
  if (process.env.REDISHOST) {
    const user = process.env.REDIS_USER || "";
    const pass = process.env.REDIS_PASSWORD || "";
    const auth =
      user || pass
        ? `${user}${pass ? ":" + pass : ""}@`
        : pass
          ? `:${pass}@`
          : "";
    return `redis://${auth}${process.env.REDISHOST}:${process.env.REDISPORT || 6379}`;
  }
  return "";
}

function resolveDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

// Normalize env before zod parse
if (!process.env.REDIS_URL) {
  const r = resolveRedisUrl();
  if (r) process.env.REDIS_URL = r;
}
if (!process.env.DATABASE_URL) {
  const d = resolveDatabaseUrl();
  if (d) process.env.DATABASE_URL = d;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3100),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  DATABASE_URL: z.string().min(1),
  DB_POOL_MAX: z.coerce.number().default(20),

  REDIS_URL: z.string().min(1),
  REDIS_PREFIX: z.string().default("lilly:"),

  LLM_API_URL: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),

  CREATOR_HANDLE: z.string().default("lilly"),
  BRAND_VOICE: z.string().default("confident, playful, professional"),
  PRIMARY_TRAFFIC_URL: z.string().url().or(z.string().min(1)).default("https://example.com"),
  TIMEZONE: z.string().default("America/New_York"),

  PUBLISH_AUTO_APPROVED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  PUBLISH_REQUIRE_COMPLIANCE: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  DEFAULT_POST_INTERVAL_MINUTES: z.coerce.number().default(180),

  AUTONOMY_ENABLED: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  AUTONOMY_INTERVAL_MINUTES: z.coerce.number().default(60),
  AUTONOMY_LEVEL: z.enum(["supervised", "semi", "full"]).default("semi"),
  AUTONOMY_DEFAULT_GOAL: z
    .string()
    .default(
      "Continuously grow traffic to the primary adult content account via compliant multi-platform posts"
    ),

  WEBHOOK_SECRET: z.string().optional().default(""),

  WS_PATH: z.string().default("/ws"),
  API_KEY: z.string().min(8),
  CORS_ORIGINS: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    const hint = [
      "Railway requires:",
      "  1) Add PostgreSQL plugin → set DATABASE_URL=${{Postgres.DATABASE_URL}}",
      "  2) Add Redis plugin → set REDIS_URL=${{Redis.REDIS_URL}}",
      "  3) Set API_KEY to a long random secret (Variables tab)",
      "  4) Set PRIMARY_TRAFFIC_URL to your traffic link",
      "See docs/RAILWAY.md",
    ].join("\n");
    throw new Error(`Invalid environment configuration:\n${missing.join("\n")}\n\n${hint}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === "production",
  isDev: env.NODE_ENV === "development",
  server: {
    port: env.PORT,
    host: env.HOST,
    corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    apiKey: env.API_KEY,
    wsPath: env.WS_PATH,
  },
  db: {
    url: env.DATABASE_URL,
    poolMax: env.DB_POOL_MAX,
  },
  redis: {
    url: env.REDIS_URL,
    prefix: env.REDIS_PREFIX,
  },
  llm: {
    enabled: env.LLM_ENABLED,
    apiUrl: env.LLM_API_URL,
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
  },
  brand: {
    handle: env.CREATOR_HANDLE,
    voice: env.BRAND_VOICE,
    primaryTrafficUrl: env.PRIMARY_TRAFFIC_URL,
    timezone: env.TIMEZONE,
  },
  publish: {
    autoApproved: env.PUBLISH_AUTO_APPROVED,
    requireCompliance: env.PUBLISH_REQUIRE_COMPLIANCE,
    defaultIntervalMinutes: env.DEFAULT_POST_INTERVAL_MINUTES,
  },
  autonomy: {
    enabled: env.AUTONOMY_ENABLED,
    intervalMinutes: env.AUTONOMY_INTERVAL_MINUTES,
    level: env.AUTONOMY_LEVEL,
    defaultGoal: env.AUTONOMY_DEFAULT_GOAL,
  },
  webhookSecret: env.WEBHOOK_SECRET,
  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;

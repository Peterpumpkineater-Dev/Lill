import { z } from "zod";
import dotenv from "dotenv";
import { validateInfraEnv } from "../infra/env-validation";

dotenv.config();

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

if (!process.env.REDIS_URL) {
  const r = resolveRedisUrl();
  if (r) process.env.REDIS_URL = r;
}
if (!process.env.DATABASE_URL) {
  const d = resolveDatabaseUrl();
  if (d) process.env.DATABASE_URL = d;
}

// Railway / production hosts: default NODE_ENV to production when unset
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID
);
if (!process.env.NODE_ENV && onRailway) {
  process.env.NODE_ENV = "production";
}
// Railway public networking defaults to 3000 — match if PORT unset
if (!process.env.PORT && onRailway) {
  process.env.PORT = "3000";
}

const bool = (def: string) =>
  z
    .string()
    .transform((v) => v === "true")
    .default(def);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default(onRailway ? "production" : "development"),
  PORT: z.coerce.number().default(onRailway ? 3000 : 3100),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** Explicit opt-in for pino-pretty (never required in production image) */
  LOG_PRETTY: bool("false"),

  DATABASE_URL: z.string().optional().default(""),
  DB_POOL_MAX: z.coerce.number().default(20),

  REDIS_URL: z.string().optional().default(""),
  REDIS_PREFIX: z.string().default("lilly:"),

  LLM_API_URL: z.string().optional().default(""),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_ENABLED: bool("false"),

  CREATOR_HANDLE: z.string().default("lillyissilly"),
  BRAND_VOICE: z
    .string()
    .default("playful, confident, warm, flirty but in control"),
  PRIMARY_TRAFFIC_URL: z
    .string()
    .url()
    .or(z.string().min(1))
    .default("https://onlyfans.com/lillyissilly"),
  TIMEZONE: z.string().default("America/New_York"),
PERSONA_BIO: z
    .string()
    .default(
      "Lilly is an adult content creator (lillyissilly). She is flirty, playful, and confident. She chats with fans in first person, can get spicy/NSFW when asked, sends teasing pics when media is enabled, and naturally drives interest to her primary page. She is not a corporate business bot."
    ),

  PUBLISH_AUTO_APPROVED: bool("true"),
  PUBLISH_REQUIRE_COMPLIANCE: bool("true"),
  DEFAULT_POST_INTERVAL_MINUTES: z.coerce.number().default(180),

  AUTONOMY_ENABLED: bool("true"),
  AUTONOMY_INTERVAL_MINUTES: z.coerce.number().default(60),
  AUTONOMY_LEVEL: z.enum(["supervised", "semi", "full"]).default("full"),
  AUTONOMY_DEFAULT_GOAL: z
    .string()
    .default(
      "Continuously grow traffic to the primary adult content account via compliant multi-platform posts and self-generated media"
    ),
  AUTONOMY_GENERATE_MEDIA: bool("true"),

  DAILY_IMAGE_BUDGET: z.coerce.number().default(50),
  DAILY_TOKEN_BUDGET: z.coerce.number().default(500000),
  FAN_AUTO_REPLY: bool("false"),
  FAN_IMAGE_PER_USER_DAY: z.coerce.number().default(3),

  MEDIA_ENABLED: bool("false"),
  MEDIA_PROVIDER: z.enum(["fal", "replicate", "stub"]).default("stub"),
  FAL_KEY: z.string().optional().default(""),
  FAL_IMAGE_MODEL: z.string().default("fal-ai/flux/dev"),
  LORA_TRIGGER: z.string().default("lillyissilly"),
  LORA_PATH_OR_URL: z.string().optional().default(""),
  LORA_SCALE: z.coerce.number().default(1),
  REPLICATE_API_TOKEN: z.string().optional().default(""),

  WEBHOOK_SECRET: z.string().optional().default(""),

  CHAT_ENABLED: bool("true"),
  /** Shared password for the 2-person training web chat (not the full API key) */
  CHAT_PASSWORD: z.string().min(4).default("lilly-train-2026"),

  WS_PATH: z.string().default("/ws"),
  API_KEY: z.string().min(8).default("lilly_4xrDfd0XltWntEJ4VPk2xm818YlKoJXee14yoDxy2w8"),
  CORS_ORIGINS: z.string().default("*"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${missing.join("\n")}`);
  }
  return parsed.data;
}

export const env = loadEnv();

const dbUrl = env.DATABASE_URL || "";
const redisUrl = env.REDIS_URL || "";

const infraStatus = validateInfraEnv({
  databaseUrl: dbUrl,
  redisUrl,
  production: env.NODE_ENV === "production" || onRailway,
});

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === "production",
  isDev: env.NODE_ENV === "development",
  /** Only true when LOG_PRETTY=true — never auto-enable in production images */
  logPretty: env.LOG_PRETTY,
  /** True only when DB+Redis are set and not invalid localhost in production */
  ready: infraStatus.ok,
  missing: infraStatus.missing.length
    ? infraStatus.missing
    : infraStatus.errors.length
      ? ["INVALID_INFRA_URLS"]
      : [],
  infra: infraStatus,
  server: {
    port: env.PORT,
    host: env.HOST,
    corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    apiKey: env.API_KEY,
    wsPath: env.WS_PATH,
  },
  db: {
    url: dbUrl,
    poolMax: env.DB_POOL_MAX,
  },
  redis: {
    url: redisUrl,
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
    personaBio: env.PERSONA_BIO,
  },
  publish: {
    autoApproved: env.PUBLISH_AUTO_APPROVED,
    requireCompliance: env.PUBLISH_REQUIRE_COMPLIANCE,
    defaultIntervalMinutes: env.DEFAULT_POST_INTERVAL_MINUTES,
  },
  autonomy: {
    enabled: env.AUTONOMY_ENABLED && Boolean(dbUrl && redisUrl),
    intervalMinutes: env.AUTONOMY_INTERVAL_MINUTES,
    level: env.AUTONOMY_LEVEL,
    defaultGoal: env.AUTONOMY_DEFAULT_GOAL,
    generateMedia: env.AUTONOMY_GENERATE_MEDIA,
  },
  budgets: {
    dailyImages: env.DAILY_IMAGE_BUDGET,
    dailyTokens: env.DAILY_TOKEN_BUDGET,
    fanAutoReply: env.FAN_AUTO_REPLY,
    fanImagesPerUserDay: env.FAN_IMAGE_PER_USER_DAY,
  },
  media: {
    enabled: env.MEDIA_ENABLED,
    provider: env.MEDIA_PROVIDER,
    falKey: env.FAL_KEY,
    falImageModel: env.FAL_IMAGE_MODEL,
    loraTrigger: env.LORA_TRIGGER,
    loraPathOrUrl: env.LORA_PATH_OR_URL,
    loraScale: env.LORA_SCALE,
    replicateToken: env.REPLICATE_API_TOKEN,
  },
  webhookSecret: env.WEBHOOK_SECRET,
  chat: {
    enabled: env.CHAT_ENABLED,
    password: env.CHAT_PASSWORD,
  },
  logLevel: env.LOG_LEVEL,
} as const;

export type AppConfig = typeof config;

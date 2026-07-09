/**
 * Startup validation for DATABASE_URL / REDIS_URL.
 * Production (and Railway): require real remote URLs, never localhost.
 * Local development: allow missing URLs (setup mode) unless STRICT_ENV=true.
 */

export type InfraEnvStatus = {
  ok: boolean;
  production: boolean;
  databaseUrl: string;
  redisUrl: string;
  missing: string[];
  warnings: string[];
  errors: string[];
  hints: string[];
};

function isLocalhostUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "::1"
    );
  } catch {
    return /localhost|127\.0\.0\.1/.test(url);
  }
}

export function isProductionLike(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    Boolean(
      process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID
    ) ||
    process.env.STRICT_ENV === "true"
  );
}

export function validateInfraEnv(opts?: {
  databaseUrl?: string;
  redisUrl?: string;
  production?: boolean;
}): InfraEnvStatus {
  const production = opts?.production ?? isProductionLike();
  const databaseUrl = (
    opts?.databaseUrl ??
    process.env.DATABASE_URL ??
    process.env.DATABASE_PRIVATE_URL ??
    process.env.POSTGRES_URL ??
    ""
  ).trim();
  const redisUrl = (
    opts?.redisUrl ??
    process.env.REDIS_URL ??
    process.env.REDIS_PRIVATE_URL ??
    ""
  ).trim();

  const missing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const hints: string[] = [];

  if (!databaseUrl) {
    missing.push("DATABASE_URL");
    hints.push(
      "Set DATABASE_URL from Railway Postgres: Variable Reference → Postgres → DATABASE_URL (or DATABASE_URL=${{Postgres.DATABASE_URL}})"
    );
  } else if (isLocalhostUrl(databaseUrl) && production) {
    errors.push(
      "DATABASE_URL points to localhost — on Railway that is the Lilly container, not Postgres. Use the Postgres service reference URL."
    );
    hints.push(
      "Lilly → Variables → DATABASE_URL → Add Reference → Postgres → DATABASE_URL"
    );
  }

  if (!redisUrl) {
    missing.push("REDIS_URL");
    hints.push(
      "Set REDIS_URL from Railway Redis: Variable Reference → Redis → REDIS_URL (or REDIS_URL=${{Redis.REDIS_URL}}). Do NOT use redis://localhost:6379 on Railway."
    );
  } else if (isLocalhostUrl(redisUrl) && production) {
    errors.push(
      "REDIS_URL is redis://localhost:… — wrong on Railway. Use the Redis plugin URL (e.g. redis://…@redis.railway.internal:6379)."
    );
    hints.push(
      "Delete redis://localhost:6379. Lilly → Variables → REDIS_URL → Add Reference → Redis → REDIS_URL"
    );
  }

  if (production && (missing.length || errors.length)) {
    // production: not ready
  } else if (!production && missing.length) {
    warnings.push(
      `Local/dev mode: missing ${missing.join(", ")} — running in setup mode. Use docker compose for local Postgres/Redis.`
    );
  }

  const ok =
    missing.length === 0 &&
    errors.length === 0 &&
    Boolean(databaseUrl) &&
    Boolean(redisUrl) &&
    !(production && (isLocalhostUrl(databaseUrl) || isLocalhostUrl(redisUrl)));

  return {
    ok,
    production,
    databaseUrl: databaseUrl ? "[set]" : "",
    redisUrl: redisUrl ? "[set]" : "",
    missing,
    warnings,
    errors,
    hints,
  };
}

/** Throw only when production-like and infra is invalid */
export function assertInfraEnvOrThrow(): InfraEnvStatus {
  const status = validateInfraEnv();
  if (status.production && !status.ok) {
    const lines = [
      "Lilly OS infrastructure configuration invalid for production/Railway:",
      ...status.missing.map((m) => `  MISSING env: ${m}`),
      ...status.errors.map((e) => `  ERROR: ${e}`),
      ...status.hints.map((h) => `  HINT: ${h}`),
      "See docs/RAILWAY.md",
    ];
    const err = new Error(lines.join("\n"));
    (err as Error & { infra: InfraEnvStatus }).infra = status;
    throw err;
  }
  return status;
}

export function logInfraStatus(
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void }
): InfraEnvStatus {
  const status = validateInfraEnv();
  if (status.ok) {
    log.info(
      { production: status.production, database: true, redis: true },
      "infra env OK (DATABASE_URL + REDIS_URL)"
    );
  } else if (status.production) {
    log.warn(
      {
        missing: status.missing,
        errors: status.errors,
        hints: status.hints,
      },
      "infra env INVALID for production"
    );
  } else {
    log.warn(
      {
        missing: status.missing,
        warnings: status.warnings,
        hints: status.hints,
      },
      "infra env incomplete — setup mode allowed in local dev"
    );
  }
  return status;
}

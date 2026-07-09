import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  validateInfraEnv,
  isProductionLike,
} from "../../src/infra/env-validation";

describe("validateInfraEnv", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("reports missing DATABASE_URL and REDIS_URL", () => {
    const status = validateInfraEnv({
      databaseUrl: "",
      redisUrl: "",
      production: false,
    });
    expect(status.ok).toBe(false);
    expect(status.missing).toContain("DATABASE_URL");
    expect(status.missing).toContain("REDIS_URL");
    expect(status.hints.some((h) => h.includes("DATABASE_URL"))).toBe(true);
    expect(status.hints.some((h) => h.includes("REDIS_URL"))).toBe(true);
  });

  it("rejects localhost REDIS_URL in production", () => {
    const status = validateInfraEnv({
      databaseUrl: "postgresql://u:p@postgres.railway.internal:5432/db",
      redisUrl: "redis://localhost:6379",
      production: true,
    });
    expect(status.ok).toBe(false);
    expect(status.errors.some((e) => e.includes("localhost"))).toBe(true);
  });

  it("accepts railway-style URLs in production", () => {
    const status = validateInfraEnv({
      databaseUrl: "postgresql://u:p@postgres.railway.internal:5432/railway",
      redisUrl: "redis://default:secret@redis.railway.internal:6379",
      production: true,
    });
    expect(status.ok).toBe(true);
    expect(status.missing).toHaveLength(0);
    expect(status.errors).toHaveLength(0);
  });

  it("allows missing URLs in local non-production (setup mode)", () => {
    const status = validateInfraEnv({
      databaseUrl: "",
      redisUrl: "",
      production: false,
    });
    expect(status.ok).toBe(false);
    expect(status.warnings.length + status.missing.length).toBeGreaterThan(0);
  });

  it("allows localhost in non-production for docker compose", () => {
    const status = validateInfraEnv({
      databaseUrl: "postgresql://lilly:lilly_secret@localhost:5432/lilly_os",
      redisUrl: "redis://localhost:6379",
      production: false,
    });
    expect(status.ok).toBe(true);
  });
});

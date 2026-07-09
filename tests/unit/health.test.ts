/**
 * Health report shape tests (no live DB required).
 */
import { describe, it, expect, afterEach } from "vitest";
import { buildHealthReport } from "../../src/infra/health";

describe("buildHealthReport", () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it("includes server, postgres, redis sections", async () => {
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.DATABASE_PRIVATE_URL;
    delete process.env.REDIS_PRIVATE_URL;
    process.env.NODE_ENV = "development";

    const report = await buildHealthReport({ listenPort: 3100 });

    expect(report.server.ok).toBe(true);
    expect(report.server.listenPort).toBe(3100);
    expect(report.postgres).toBeDefined();
    expect(report.redis).toBeDefined();
    expect(report.env).toBeDefined();
    expect(report.talk).toBe("/chat");
    expect(report.postgres.configured).toBe(false);
    expect(report.redis.configured).toBe(false);
    expect(["setup", "down", "degraded", "ok"]).toContain(report.status);
  });

  it("flags localhost redis error path via env validation in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://u:p@db.example:5432/x";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.RAILWAY_ENVIRONMENT = "production";

    const report = await buildHealthReport({ listenPort: 3000 });
    expect(report.env.errors.length + (report.redis.error ? 1 : 0)).toBeGreaterThan(0);
    expect(report.server.ok).toBe(true);
  });
});

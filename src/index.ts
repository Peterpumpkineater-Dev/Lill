import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import pinoHttp from "pino-http";
import Redis from "ioredis";
import { config } from "./config";
import { logger, childLogger } from "./core/logger";
import { eventBus } from "./core/event-bus";
import { queueManager } from "./core/queue";
import { pluginRegistry } from "./core/plugin";
import { AgentRegistry } from "./core/agent-registry";
import { MemorySystem } from "./core/memory";
import { MemoryRepository } from "./db/repositories/memory.repo";
import { closeDb, checkDb } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { createApiRouter } from "./api/routes";
import { createWebhookRouter } from "./api/routes/webhooks";
import { attachWebSocket } from "./api/websocket";
import { apiKeyAuth, errorHandler, notFound } from "./api/middleware";
import { MissionDirectorAgent } from "./agents/mission-director";
import { ContentPlannerAgent } from "./agents/content-planner";
import { CommunityAgent } from "./agents/community";
import { AnalyticsAgent } from "./agents/analytics";
import { MemoryManagerAgent } from "./agents/memory-manager";
import { ComplianceAgent } from "./agents/compliance";
import { SchedulerAgent } from "./agents/scheduler";
import { PublisherAgent } from "./agents/publisher";
import { DashboardAgent } from "./agents/dashboard";
import { AutonomyAgent } from "./agents/autonomy";
import { registerPlatformPlugins } from "./services/platforms";
import type { AgentContext } from "./agents/base";
import type { AgentName } from "./types/domain";

const log = childLogger("bootstrap");

async function startHttpOnly(reason: string): Promise<void> {
  log.warn({ reason, missing: config.missing }, "starting setup mode (HTTP only)");

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "setup",
      message: "Lilly is up but needs Postgres + Redis linked on Railway",
      missing: config.missing,
      setup: {
        step1: "Canvas → + Create → Database → PostgreSQL",
        step2: "Canvas → + Create → Database → Redis",
        step3: "Lilly → Variables → add DATABASE_URL reference to Postgres",
        step4: "Lilly → Variables → add REDIS_URL reference to Redis",
        step5: "Redeploy",
      },
      version: "1.0.0",
    });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "Lilly OS",
      mode: "setup",
      health: "/health",
      missing: config.missing,
    });
  });

  app.use((_req, res) => {
    res.status(503).json({
      error: "setup incomplete",
      missing: config.missing,
      hint: "Add PostgreSQL and Redis on the Railway canvas, link DATABASE_URL and REDIS_URL, then redeploy",
    });
  });

  const server = http.createServer(app);
  server.listen(config.server.port, config.server.host, () => {
    log.info(
      { port: config.server.port, mode: "setup" },
      "Lilly OS listening (setup mode)"
    );
  });

  const shutdown = (signal: string) => {
    log.info({ signal }, "shutting down");
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function startFull(): Promise<void> {
  // Migrate before serving
  try {
    await runMigrations();
    log.info("migrations ok");
  } catch (err) {
    log.error({ err }, "migration failed — check DATABASE_URL");
    throw err;
  }

  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  try {
    await redis.connect();
  } catch (err) {
    log.error({ err }, "redis connect failed");
    throw err;
  }

  const memory = new MemorySystem(
    new MemoryRepository(),
    redis,
    config.redis.prefix
  );

  try {
    const existingVoice = await memory.brandVoice();
    if (!existingVoice) {
      await memory.setBrandVoice(config.brand.voice);
    }
    await memory.remember({
      scope: "brand",
      key: "brand.primary_traffic_url",
      value: config.brand.primaryTrafficUrl,
      tags: ["traffic", "brand"],
      importance: 1,
    });
  } catch (err) {
    log.warn({ err }, "memory bootstrap skipped");
  }

  const adapters: Array<{ id: string; adapter: unknown }> = [];
  registerPlatformPlugins((id, adapter) => {
    adapters.push({ id, adapter });
  });
  for (const { id, adapter } of adapters) {
    await pluginRegistry.register({
      manifest: {
        id: `platform-${id}`,
        name: `Platform: ${id}`,
        version: "1.0.0",
        description: `Publishing adapter for ${id}`,
      },
      activate: (ctx) => {
        ctx.registerPlatform(id, adapter);
      },
    });
  }

  const agentCtx = (name: string): AgentContext => ({
    bus: eventBus,
    memory,
    logger: childLogger(name),
  });

  const registry = new AgentRegistry();
  const dashboard = new DashboardAgent(agentCtx("dashboard"), redis);
  const autonomy = new AutonomyAgent(agentCtx("autonomy"));
  autonomy.setRegistry(registry);

  const agentList = [
    new MissionDirectorAgent(agentCtx("mission-director")),
    new ContentPlannerAgent(agentCtx("content-planner")),
    new CommunityAgent(agentCtx("community")),
    new AnalyticsAgent(agentCtx("analytics")),
    new MemoryManagerAgent(agentCtx("memory-manager")),
    new ComplianceAgent(agentCtx("compliance")),
    new SchedulerAgent(agentCtx("scheduler")),
    new PublisherAgent(agentCtx("publisher")),
    dashboard,
    autonomy,
  ];

  for (const agent of agentList) {
    registry.register(agent);
  }

  await registry.startAll();

  for (const name of registry.list()) {
    dashboard.setAgentOnline(name as AgentName, true);
  }

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.server.corsOrigins.includes("*")
        ? true
        : config.server.corsOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: config.isDev,
    })
  );

  app.get("/health", async (_req, res) => {
    const dbOk = await checkDb();
    let redisOk = false;
    try {
      redisOk = (await redis.ping()) === "PONG";
    } catch {
      redisOk = false;
    }
    const ok = dbOk && redisOk;
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      db: dbOk,
      redis: redisOk,
      autonomy: config.autonomy.enabled,
      llm: config.llm.enabled,
      version: "1.0.0",
    });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "Lilly OS",
      version: "1.0.0",
      health: "/health",
      api: "/api",
      webhooks: "/api/webhooks",
      ws: config.server.wsPath,
    });
  });

  app.use("/api/webhooks", createWebhookRouter(registry));
  app.use("/api", apiKeyAuth, createApiRouter(registry, dashboard));
  app.use(notFound);
  app.use(errorHandler);

  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.server.port, config.server.host, () => {
    log.info(
      {
        port: config.server.port,
        host: config.server.host,
        autonomy: config.autonomy.enabled,
        llm: config.llm.enabled,
      },
      "Lilly OS listening"
    );
  });

  await eventBus.emit("system.started", {
    version: "1.0.0",
    at: new Date(),
  });

  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down");
    server.close();
    await registry.stopAll();
    await queueManager.close();
    redis.disconnect();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

async function main(): Promise<void> {
  if (!config.ready) {
    await startHttpOnly(config.missing.join("; "));
    return;
  }
  await startFull();
}

main().catch((err) => {
  logger.fatal({ err }, "fatal bootstrap error");
  // Last resort: still try setup HTTP so healthcheck can show the error
  startHttpOnly(err instanceof Error ? err.message : String(err)).catch(() => {
    process.exit(1);
  });
});

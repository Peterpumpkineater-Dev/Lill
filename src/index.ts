/**
 * Bootstrap — setup mode uses only light imports.
 * Full stack is loaded dynamically so missing Redis never crashes on import.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { config } from "./config";
import { logger, childLogger } from "./core/logger";

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
      selfRun: {
        autonomy: "full when DB+Redis ready",
        persona: "chat as Lilly",
        media: "LoRA image gen when MEDIA_ENABLED + FAL_KEY",
      },
      setup: {
        step1: "Canvas → + Create → Database → PostgreSQL",
        step2: "Canvas → + Create → Database → Redis",
        step3: "Lilly → Variables → DATABASE_URL reference to Postgres",
        step4: "Lilly → Variables → REDIS_URL reference to Redis",
        step5: "Optional: LLM_API_KEY, FAL_KEY, MEDIA_ENABLED=true",
        step6: "Redeploy",
      },
      version: "1.1.0",
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
      hint: "Add PostgreSQL and Redis on Railway, link DATABASE_URL and REDIS_URL",
    });
  });

  const server = http.createServer(app);
  server.listen(config.server.port, config.server.host, () => {
    log.info({ port: config.server.port, mode: "setup" }, "Lilly OS listening (setup mode)");
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
  const pinoHttp = (await import("pino-http")).default;
  const Redis = (await import("ioredis")).default;
  const { eventBus } = await import("./core/event-bus");
  const { queueManager } = await import("./core/queue");
  const { pluginRegistry } = await import("./core/plugin");
  const { AgentRegistry } = await import("./core/agent-registry");
  const { MemorySystem } = await import("./core/memory");
  const { MemoryRepository } = await import("./db/repositories/memory.repo");
  const { closeDb, checkDb } = await import("./db/pool");
  const { runMigrations } = await import("./db/migrate");
  const { createApiRouter } = await import("./api/routes");
  const { createWebhookRouter } = await import("./api/routes/webhooks");
  const { attachWebSocket } = await import("./api/websocket");
  const { apiKeyAuth, errorHandler, notFound } = await import("./api/middleware");
  const { MissionDirectorAgent } = await import("./agents/mission-director");
  const { ContentPlannerAgent } = await import("./agents/content-planner");
  const { CommunityAgent } = await import("./agents/community");
  const { AnalyticsAgent } = await import("./agents/analytics");
  const { MemoryManagerAgent } = await import("./agents/memory-manager");
  const { ComplianceAgent } = await import("./agents/compliance");
  const { SchedulerAgent } = await import("./agents/scheduler");
  const { PublisherAgent } = await import("./agents/publisher");
  const { DashboardAgent } = await import("./agents/dashboard");
  const { AutonomyAgent } = await import("./agents/autonomy");
  const { PersonaAgent } = await import("./agents/persona");
  const { MediaAgent } = await import("./agents/media");
  const { registerPlatformPlugins } = await import("./services/platforms");
  const { BudgetService } = await import("./services/budget");
  type AgentContext = import("./agents/base").AgentContext;
  type AgentName = import("./types/domain").AgentName;

  try {
    await runMigrations();
    log.info("migrations ok");
  } catch (err) {
    log.error({ err }, "migration failed");
    throw err;
  }

  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  await redis.connect();

  const budget = new BudgetService(redis);
  const memory = new MemorySystem(new MemoryRepository(), redis, config.redis.prefix);

  try {
    const existingVoice = await memory.brandVoice();
    if (!existingVoice) await memory.setBrandVoice(config.brand.voice);
    await memory.remember({
      scope: "brand",
      key: "brand.primary_traffic_url",
      value: config.brand.primaryTrafficUrl,
      tags: ["traffic", "brand"],
      importance: 1,
    });
    await memory.remember({
      scope: "brand",
      key: "brand.persona",
      value: config.brand.personaBio,
      tags: ["persona", "brand"],
      importance: 1,
    });
  } catch (err) {
    log.warn({ err }, "memory bootstrap skipped");
  }

  const adapters: Array<{ id: string; adapter: unknown }> = [];
  registerPlatformPlugins((id, adapter) => adapters.push({ id, adapter }));
  for (const { id, adapter } of adapters) {
    await pluginRegistry.register({
      manifest: {
        id: `platform-${id}`,
        name: `Platform: ${id}`,
        version: "1.0.0",
      },
      activate: (ctx) => ctx.registerPlatform(id, adapter),
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
  const persona = new PersonaAgent(agentCtx("persona"));
  const media = new MediaAgent(agentCtx("media"));

  autonomy.setRegistry(registry);
  persona.setRegistry(registry);
  persona.setBudget(budget);
  media.setBudget(budget);

  for (const agent of [
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
    persona,
    media,
  ]) {
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
  app.use(pinoHttp({ logger, autoLogging: config.isDev }));

  app.get("/health", async (_req, res) => {
    const dbOk = await checkDb();
    let redisOk = false;
    try {
      redisOk = (await redis.ping()) === "PONG";
    } catch {
      redisOk = false;
    }
    const ok = dbOk && redisOk;
    const budgets = await budget.snapshot();
    res.status(ok ? 200 : 503).json({
      status: ok ? "ok" : "degraded",
      db: dbOk,
      redis: redisOk,
      autonomy: config.autonomy.enabled,
      autonomyLevel: config.autonomy.level,
      llm: config.llm.enabled,
      media: config.media.enabled,
      budgets,
      version: "1.1.0",
    });
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "Lilly OS",
      version: "1.1.0",
      mode: "full",
      health: "/health",
      chat: "POST /api/chat",
      media: "POST /api/media/image",
      fan: "POST /api/fan/chat",
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
        autonomy: config.autonomy.enabled,
        level: config.autonomy.level,
        media: config.media.enabled,
        llm: config.llm.enabled,
      },
      "Lilly OS listening (full self-run)"
    );
  });

  await eventBus.emit("system.started", { version: "1.1.0", at: new Date() });

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
  try {
    await startFull();
  } catch (err) {
    logger.error({ err }, "full boot failed — falling back to setup HTTP");
    await startHttpOnly(err instanceof Error ? err.message : String(err));
  }
}

main().catch((err) => {
  logger.fatal({ err }, "fatal bootstrap error");
  process.exit(1);
});

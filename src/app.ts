/**
 * Express application factory — loaded AFTER HTTP is already listening.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { config } from "./config";
import { logger, childLogger } from "./core/logger";
import { logInfraStatus } from "./infra/env-validation";
import { buildHealthReport } from "./infra/health";
import { createChatRouter } from "./api/routes/chat";

const log = childLogger("app");

export type AppMode = "setup" | "full";

export interface CreateAppResult {
  handler: (req: IncomingMessage, res: ServerResponse) => void;
  mode: AppMode;
  error: string | null;
}

function errDetail(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { err: String(err) };
  const e = err as Error & { code?: string; detail?: string };
  return {
    errMessage: e.message,
    errName: e.name,
    errCode: e.code,
    errDetail: e.detail,
    errStack: e.stack?.split("\n").slice(0, 8).join("\n"),
  };
}

function resolvePublicDir(): string {
  const fs = require("fs") as typeof import("fs");
  const candidates = [
    path.join(__dirname, "..", "public"),
    path.join(process.cwd(), "public"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "chat.html"))) return c;
  }
  return candidates[0];
}

async function buildSetupApp(reason: string): Promise<CreateAppResult> {
  logInfraStatus(log);
  log.warn({ reason, missing: config.missing, infra: config.infra }, "building setup Express app");
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "2mb" }));

  const publicDir = resolvePublicDir();
  app.use(express.static(publicDir));

  app.get("/health", async (_req, res) => {
    const report = await buildHealthReport({
      listenPort: config.server.port,
    });
    res.status(200).json({
      ...report,
      status: "setup",
      message: "Lilly is up — fix DATABASE_URL / REDIS_URL for full mode",
      reason,
      talk: "/chat",
    });
  });

  app.get("/chat", (_req, res) => {
    res.sendFile(path.join(publicDir, "chat.html"));
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "Lilly OS",
      mode: "setup",
      health: "/health",
      talk: "/chat",
      chat: "POST /api/chat",
      missing: config.missing,
      infra: config.infra,
    });
  });

  // Chat works even without Postgres/Redis (LLM or local persona fallback)
  app.use("/api/chat", createChatRouter());

  app.use("/api", (_req, res) => {
    res.status(503).json({
      error: "setup incomplete",
      missing: config.missing,
      errors: config.infra.errors,
      hints: config.infra.hints,
      required: {
        DATABASE_URL:
          "Railway: Variable Reference → Postgres → DATABASE_URL  OR  DATABASE_URL=${{Postgres.DATABASE_URL}}",
        REDIS_URL:
          "Railway: Variable Reference → Redis → REDIS_URL  OR  REDIS_URL=${{Redis.REDIS_URL}}  — never redis://localhost:6379 on Railway",
      },
    });
  });

  // Body-parse and route errors → JSON, never an HTML stack trace
  app.use(
    (
      err: Error & { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(err.status ?? 500).json({ error: err.message || "internal error" });
    }
  );

  return {
    handler: app as unknown as CreateAppResult["handler"],
    mode: "setup",
    error: reason || null,
  };
}

async function buildFullApp(): Promise<CreateAppResult> {
  const pinoHttp = (await import("pino-http")).default;
  const Redis = (await import("ioredis")).default;
  const { eventBus } = await import("./core/event-bus");
  const { queueManager } = await import("./core/queue");
  const { pluginRegistry } = await import("./core/plugin");
  const { AgentRegistry } = await import("./core/agent-registry");
  const { MemorySystem } = await import("./core/memory");
  const { MemoryRepository } = await import("./db/repositories/memory.repo");
  const { closeDb } = await import("./db/pool");
  const { runMigrations } = await import("./db/migrate");
  const { createApiRouter } = await import("./api/routes");
  const { createWebhookRouter } = await import("./api/routes/webhooks");
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
  const { createTrainingChatRouter } = await import("./api/routes/training-chat");
  type AgentContext = import("./agents/base").AgentContext;
  type AgentName = import("./types/domain").AgentName;

  log.info(
    {
      listenPort: config.server.port,
      envPort: process.env.PORT ?? null,
      hasDatabaseUrl: Boolean(config.db.url),
      hasRedisUrl: Boolean(config.redis.url),
    },
    "full boot starting"
  );

  try {
    await runMigrations();
    log.info("migrations ok");
  } catch (err) {
    log.error({ ...errDetail(err) }, "migration failed");
    throw err;
  }

  const redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 15_000,
  });
  try {
    await redis.connect();
    log.info("redis connected");
  } catch (err) {
    log.error({ ...errDetail(err) }, "redis connect failed");
    throw err;
  }

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
    log.warn({ ...errDetail(err) }, "memory bootstrap skipped");
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

  const publicDir = resolvePublicDir();
  app.use(express.static(publicDir));

  app.get("/health", async (_req, res) => {
    const report = await buildHealthReport({
      redis,
      listenPort: config.server.port,
    });
    const budgets = await budget.snapshot();
    const httpStatus =
      report.status === "ok" ? 200 : report.status === "degraded" ? 200 : 503;
    res.status(httpStatus).json({
      ...report,
      autonomy: config.autonomy.enabled,
      autonomyLevel: config.autonomy.level,
      llm: config.llm.enabled,
      media: config.media.enabled,
      budgets,
      chatUi: "/chat",
    });
  });

  app.get("/chat", (_req, res) => {
    res.sendFile(path.join(publicDir, "chat.html"));
  });

  app.get("/", (_req, res) => {
    res.json({
      name: "Lilly OS",
      version: "1.3.0",
      mode: "full",
      health: "/health",
      talk: "/chat",
      chat: "POST /api/chat",
      media: "POST /api/media/image",
      trainingExport: "GET /api/training/export",
    });
  });

  app.use("/api/chat", createChatRouter());
  app.use("/api/public/chat", createTrainingChatRouter(registry));
  app.use("/api/webhooks", createWebhookRouter(registry));
  app.use("/api", apiKeyAuth, createApiRouter(registry, dashboard));
  app.use(notFound);
  app.use(errorHandler);

  await eventBus.emit("system.started", { version: "1.3.0", at: new Date() });

  // Keep process shutdown hooks for full mode resources
  const shutdown = async (signal: string) => {
    log.info({ signal }, "shutting down full app resources");
    await registry.stopAll();
    await queueManager.close();
    redis.disconnect();
    await closeDb();
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  log.info("full Express app ready");
  return {
    handler: app as unknown as CreateAppResult["handler"],
    mode: "full",
    error: null,
  };
}

export async function createExpressApp(): Promise<CreateAppResult> {
  logInfraStatus(log);

  if (!config.ready) {
    const reason = [
      ...config.infra.missing.map((m) => `MISSING ${m}`),
      ...config.infra.errors,
    ].join("; ") || "DATABASE_URL and REDIS_URL required for full mode";
    return buildSetupApp(reason);
  }
  try {
    return await buildFullApp();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ ...errDetail(err) }, "full boot failed — using setup app");
    return buildSetupApp(message);
  }
}

import { Router, type Request, type Response } from "express";
import type { AgentRegistry } from "../../core/agent-registry";
import type { DashboardAgent } from "../../agents/dashboard";
import { eventBus } from "../../core/event-bus";
import { ContentRepository } from "../../db/repositories/content.repo";
import { MissionRepository, TaskRepository } from "../../db/repositories/mission.repo";
import {
  MetricsRepository,
  PublishJobRepository,
  ReportRepository,
  DraftRepository,
} from "../../db/repositories/metrics.repo";
import { pluginRegistry } from "../../core/plugin";

export function createApiRouter(
  agents: AgentRegistry,
  dashboard: DashboardAgent
): Router {
  const router = Router();
  const content = new ContentRepository();
  const missions = new MissionRepository();
  const tasks = new TaskRepository();
  const metrics = new MetricsRepository();
  const jobs = new PublishJobRepository();
  const reports = new ReportRepository();
  const drafts = new DraftRepository();

  router.get("/health", async (_req: Request, res: Response) => {
    const health = await dashboard.health();
    res.status(health.status === "down" ? 503 : 200).json(health);
  });

  router.get("/autonomy", async (_req, res) => {
    const result = await agents.invoke("autonomy", "status", {});
    res.json(result);
  });

  router.post("/autonomy/tick", async (_req, res) => {
    const result = await agents.invoke("autonomy", "tick", {});
    res.status(result.ok ? 200 : 400).json(result);
  });

  // ── Dashboard aggregate ────────────────────────────
  router.get("/dashboard", async (_req: Request, res: Response) => {
    const [health, kpis, upcoming, recentTasks, recentJobs, plugins] =
      await Promise.all([
        dashboard.health(),
        metrics.latestKpis(),
        content.upcoming(10),
        tasks.list({ limit: 20 }),
        jobs.list(undefined, 20),
        Promise.resolve(pluginRegistry.listPlugins()),
      ]);

    res.json({
      health,
      kpis,
      upcomingCampaigns: upcoming,
      tasks: recentTasks,
      publishJobs: recentJobs,
      plugins,
      recentEvents: eventBus.getHistory(30),
    });
  });

  // ── Missions ───────────────────────────────────────
  router.get("/missions", async (_req, res) => {
    res.json({ missions: await missions.list() });
  });

  router.post("/missions", async (req, res) => {
    const result = await agents.invoke("mission-director", "create_mission", req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  // ── Tasks ──────────────────────────────────────────
  router.get("/tasks", async (req, res) => {
    const list = await tasks.list({
      status: req.query.status as never,
      agent: req.query.agent as never,
      limit: Number(req.query.limit ?? 50),
    });
    res.json({ tasks: list });
  });

  // ── Content ────────────────────────────────────────
  router.get("/content", async (req, res) => {
    const items = await content.list({
      status: req.query.status as never,
      limit: Number(req.query.limit ?? 50),
    });
    res.json({ items });
  });

  router.post("/content/plan", async (req, res) => {
    const result = await agents.invoke("content-planner", "plan_calendar", req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.post("/content/:id/approve", async (req, res) => {
    const result = await agents.invoke("scheduler", "approve_content", {
      contentId: req.params.id,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  router.post("/content/:id/review", async (req, res) => {
    const result = await agents.invoke("compliance", "review", {
      contentId: req.params.id,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  // ── Community drafts ───────────────────────────────
  router.get("/drafts", async (req, res) => {
    res.json({ drafts: await drafts.list(req.query.status as never) });
  });

  router.post("/drafts", async (req, res) => {
    const result = await agents.invoke("community", "draft_reply", req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.post("/drafts/:id/approve", async (req, res) => {
    const result = await agents.invoke("community", "approve_draft", {
      id: req.params.id,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  // ── Analytics ──────────────────────────────────────
  router.get("/analytics/kpis", async (_req, res) => {
    res.json({ kpis: await metrics.latestKpis() });
  });

  router.post("/analytics/metrics", async (req, res) => {
    const result = await agents.invoke("analytics", "record_metric", req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.post("/analytics/reports", async (req, res) => {
    const result = await agents.invoke("analytics", "generate_report", req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.get("/analytics/reports", async (_req, res) => {
    res.json({ reports: await reports.latest() });
  });

  // ── Memory ─────────────────────────────────────────
  router.post("/memory", async (req, res) => {
    const result = await agents.invoke("memory-manager", "remember", req.body);
    res.status(result.ok ? 201 : 400).json(result);
  });

  router.get("/memory/search", async (req, res) => {
    const result = await agents.invoke("memory-manager", "search", {
      scope: req.query.scope,
      keyPrefix: req.query.keyPrefix,
      limit: req.query.limit,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  // ── Publish ────────────────────────────────────────
  router.get("/publish/jobs", async (req, res) => {
    res.json({ jobs: await jobs.list(req.query.status as never) });
  });

  router.get("/publish/platforms", async (_req, res) => {
    const result = await agents.invoke("publisher", "list_platforms", {});
    res.json(result);
  });

  router.post("/publish/jobs/:id/run", async (req, res) => {
    const result = await agents.invoke("publisher", "publish_now", {
      jobId: req.params.id,
    });
    res.status(result.ok ? 200 : 400).json(result);
  });

  // ── Events ─────────────────────────────────────────
  router.get("/events", (_req, res) => {
    res.json({ events: eventBus.getHistory(100) });
  });

  // ── Generic agent invoke ───────────────────────────
  router.post("/agents/:name/:action", async (req, res) => {
    const result = await agents.invoke(req.params.name, req.params.action, req.body ?? {});
    res.status(result.ok ? 200 : 400).json(result);
  });

  return router;
}

import { Router, type Request, type Response, type NextFunction } from "express";
import type { AgentRegistry } from "../../core/agent-registry";
import { config } from "../../config";
import { childLogger } from "../../core/logger";
import { eventBus } from "../../core/event-bus";

const log = childLogger("webhooks");

function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = config.webhookSecret;
  if (!secret) {
    // Fall back to API key if no dedicated webhook secret
    const key =
      req.header("x-webhook-secret") ||
      req.header("x-api-key") ||
      (req.header("authorization")?.startsWith("Bearer ")
        ? req.header("authorization")!.slice(7)
        : undefined);
    if (key === config.server.apiKey) {
      next();
      return;
    }
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const provided =
    req.header("x-webhook-secret") ||
    req.header("x-api-key") ||
    "";
  if (provided !== secret && provided !== config.server.apiKey) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

export function createWebhookRouter(agents: AgentRegistry): Router {
  const router = Router();
  router.use(webhookAuth);

  /** Start a mission from Zapier/n8n/cron */
  router.post("/mission", async (req: Request, res: Response) => {
    const title = String(req.body?.title ?? "Webhook mission");
    const goal = String(req.body?.goal ?? config.autonomy.defaultGoal);
    const result = await agents.invoke("mission-director", "create_mission", {
      title,
      goal,
      priority: req.body?.priority ?? "high",
    });
    log.info({ ok: result.ok, title }, "webhook mission");
    res.status(result.ok ? 201 : 400).json(result);
  });

  /** Ingest metrics from link trackers */
  router.post("/metrics", async (req: Request, res: Response) => {
    const points = Array.isArray(req.body?.metrics)
      ? req.body.metrics
      : [req.body];

    const recorded = [];
    for (const p of points) {
      if (!p?.name || p.value === undefined) continue;
      const result = await agents.invoke("analytics", "record_metric", {
        name: String(p.name),
        value: Number(p.value),
        unit: p.unit,
        platform: p.platform,
        dimensions: p.dimensions,
      });
      recorded.push(result);
    }
    res.status(201).json({ ok: true, count: recorded.length });
  });

  /** Queue content idea / plan request */
  router.post("/content", async (req: Request, res: Response) => {
    const result = await agents.invoke("content-planner", "plan_calendar", {
      goal: String(req.body?.goal ?? config.autonomy.defaultGoal),
      days: Number(req.body?.days ?? 3),
      platforms: req.body?.platforms,
    });
    res.status(result.ok ? 201 : 400).json(result);
  });

  /** Force autonomy tick */
  router.post("/autonomy/tick", async (_req: Request, res: Response) => {
    const result = await agents.invoke("autonomy", "tick", {});
    res.status(result.ok ? 200 : 400).json(result);
  });

  /** Generic event inject */
  router.post("/event", async (req: Request, res: Response) => {
    const name = req.body?.name;
    const payload = req.body?.payload ?? {};
    if (!name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    try {
      await eventBus.emit(name, payload, "system");
      res.status(202).json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "emit failed",
      });
    }
  });

  return router;
}

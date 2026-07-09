import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName } from "../../types/domain";
import {
  MetricsRepository,
  ReportRepository,
} from "../../db/repositories/metrics.repo";

/**
 * Analytics Agent — KPIs, reports, trends, experiment ideas.
 */
export class AnalyticsAgent extends BaseAgent {
  readonly name: AgentName = "analytics";
  private metrics = new MetricsRepository();
  private reports = new ReportRepository();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "analytics" }) });
  }

  protected setup(): void {
    this.subscribe("publish.completed", async ({ job }) => {
      const point = await this.metrics.record({
        name: "posts_published",
        value: 1,
        platform: job.platform,
        dimensions: { contentId: job.contentId },
      });
      await this.emit("metrics.recorded", { metrics: [point] });
    });

    this.subscribe("task.created", async ({ task }) => {
      if (task.agent !== this.name) return;
      const report = await this.generateReport("daily");
      await this.emit("task.completed", {
        task: {
          ...task,
          status: "completed",
          result: { reportId: report.id, kpis: report.kpis },
        },
      });
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "record_metric") {
      const point = await this.metrics.record({
        name: String(input.name),
        value: Number(input.value),
        unit: input.unit ? String(input.unit) : "count",
        platform: (input.platform as never) ?? "all",
        dimensions: (input.dimensions as Record<string, string>) ?? {},
      });
      await this.emit("metrics.recorded", { metrics: [point] });
      return { ok: true, data: { point } };
    }

    if (action === "kpis") {
      const kpis = await this.metrics.latestKpis();
      return { ok: true, data: { kpis } };
    }

    if (action === "generate_report") {
      const period = (input.period as "daily" | "weekly" | "monthly") ?? "daily";
      const report = await this.generateReport(period);
      return { ok: true, data: { report } };
    }

    if (action === "list_reports") {
      const list = await this.reports.latest(Number(input.limit ?? 10));
      return { ok: true, data: { reports: list } };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  async generateReport(period: "daily" | "weekly" | "monthly") {
    const days = period === "daily" ? 1 : period === "weekly" ? 7 : 30;
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [clicks, conversions, revenue, engagement, posts] = await Promise.all([
      this.metrics.sum("clicks", start),
      this.metrics.sum("conversions", start),
      this.metrics.sum("revenue", start),
      this.metrics.sum("engagement", start),
      this.metrics.sum("posts_published", start),
    ]);

    const cvr = clicks > 0 ? conversions / clicks : 0;
    const kpis = {
      clicks,
      conversions,
      revenue,
      engagement,
      posts_published: posts,
      conversion_rate: Number(cvr.toFixed(4)),
      revenue_per_click: clicks > 0 ? Number((revenue / clicks).toFixed(4)) : 0,
    };

    const trends: string[] = [];
    if (cvr >= 0.05) trends.push("Conversion rate is healthy (≥5%)");
    else if (clicks > 0) trends.push("Conversion rate below 5% — test stronger CTAs");
    if (posts < days) trends.push("Posting cadence below target — increase schedule density");
    else trends.push("Posting cadence on track");
    if (engagement > clicks * 2) trends.push("High engagement relative to clicks");
    if (revenue > 0 && conversions === 0)
      trends.push("Revenue without conversions — verify tracking tags");

    const experiments = [
      "A/B test CTA placement in first vs last line of caption",
      "Shift 2 posts into peak hours from audience memory",
      "Compare Reddit vs Twitter click-through for same creative",
      "Test traffic URL short-link vs full link",
    ];

    const summary = [
      `${period} report: ${posts} posts, ${clicks} clicks, ${conversions} conversions,`,
      `$${revenue.toFixed(2)} revenue, engagement ${engagement}.`,
      `CVR ${(cvr * 100).toFixed(2)}%.`,
    ].join(" ");

    const report = await this.reports.create({
      period,
      startDate: start,
      endDate: end,
      summary,
      kpis,
      trends,
      experiments,
    });

    await this.emit("report.generated", { report });
    this.log.info({ period, kpis }, "report generated");
    return report;
  }
}

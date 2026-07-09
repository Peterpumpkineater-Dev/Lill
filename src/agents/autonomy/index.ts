import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName } from "../../types/domain";
import { config } from "../../config";
import { ContentRepository } from "../../db/repositories/content.repo";
import { MissionRepository } from "../../db/repositories/mission.repo";
import { PublishJobRepository } from "../../db/repositories/metrics.repo";
import type { AgentRegistry } from "../../core/agent-registry";

/**
 * Autonomy orchestrator — continuous traffic growth loop.
 * Levels:
 *  - supervised: plan only
 *  - semi: auto-approve after compliance (default for Railway)
 *  - full: aggressive continuous pipeline
 */
export class AutonomyAgent extends BaseAgent {
  readonly name: AgentName = "autonomy";
  private timer: ReturnType<typeof setInterval> | null = null;
  private content = new ContentRepository();
  private missions = new MissionRepository();
  private jobs = new PublishJobRepository();
  private agents: AgentRegistry | null = null;
  private runningTick = false;

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "autonomy" }) });
  }

  setRegistry(registry: AgentRegistry): void {
    this.agents = registry;
  }

  protected setup(): void {
    if (!config.autonomy.enabled) {
      this.log.info("autonomy disabled");
      return;
    }

    const ms = Math.max(1, config.autonomy.intervalMinutes) * 60 * 1000;
    this.log.info(
      { intervalMinutes: config.autonomy.intervalMinutes, level: config.autonomy.level },
      "autonomy enabled"
    );

    // First tick after short delay so agents are ready
    setTimeout(() => void this.tick(), 15_000);
    this.timer = setInterval(() => void this.tick(), ms);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await super.stop();
  }

  async handle(
    action: string,
    _input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "tick") {
      await this.tick();
      return { ok: true, message: "autonomy tick complete" };
    }
    if (action === "status") {
      return {
        ok: true,
        data: {
          enabled: config.autonomy.enabled,
          level: config.autonomy.level,
          intervalMinutes: config.autonomy.intervalMinutes,
          llmEnabled: config.llm.enabled,
        },
      };
    }
    return { ok: false, message: `unknown action: ${action}` };
  }

  private async tick(): Promise<void> {
    if (this.runningTick || !config.autonomy.enabled || !this.agents) return;
    this.runningTick = true;
    this.log.info("autonomy tick start");

    try {
      await this.ensureActiveMission();
      await this.ensureContentPipeline();
      await this.autoApproveIfAllowed();
      await this.retryFailedPublishes();
      await this.maybeDailyReport();
    } catch (err) {
      this.log.error({ err }, "autonomy tick failed");
    } finally {
      this.runningTick = false;
      this.log.info("autonomy tick end");
    }
  }

  private async ensureActiveMission(): Promise<void> {
    const missions = await this.missions.list(10);
    const active = missions.filter((m) =>
      ["pending", "in_progress", "awaiting_approval"].includes(m.status)
    );
    if (active.length > 0) return;

    this.log.info("no active mission — creating traffic growth mission");
    await this.agents!.invoke("mission-director", "create_mission", {
      title: "Continuous traffic growth",
      goal: config.autonomy.defaultGoal,
      priority: "high",
    });
  }

  private async ensureContentPipeline(): Promise<void> {
    const upcoming = await this.content.upcoming(50);
    const minPosts = config.autonomy.level === "full" ? 14 : 7;
    if (upcoming.length >= minPosts) return;

    this.log.info({ have: upcoming.length, want: minPosts }, "refilling content calendar");
    await this.agents!.invoke("content-planner", "plan_calendar", {
      goal: config.autonomy.defaultGoal,
      days: config.autonomy.level === "full" ? 14 : 7,
      platforms: ["reddit", "twitter", "fansly"],
    });
  }

  private async autoApproveIfAllowed(): Promise<void> {
    if (config.autonomy.level === "supervised") return;
    if (!config.publish.autoApproved && config.autonomy.level !== "full") {
      // semi: approve awaiting_approval that passed compliance
      const awaiting = await this.content.list({
        status: "awaiting_approval",
        limit: 50,
      });
      for (const item of awaiting) {
        if (item.complianceVerdict === "pass" || item.complianceVerdict === null) {
          if (item.complianceVerdict === null) {
            await this.agents!.invoke("compliance", "review", {
              contentId: item.id,
            });
          }
          const refreshed = await this.content.findById(item.id);
          if (refreshed?.complianceVerdict === "pass") {
            await this.agents!.invoke("scheduler", "approve_content", {
              contentId: item.id,
            });
          }
        }
      }
      return;
    }

    if (config.publish.autoApproved || config.autonomy.level === "full") {
      const awaiting = await this.content.list({
        status: "awaiting_approval",
        limit: 50,
      });
      for (const item of awaiting) {
        if (item.complianceVerdict !== "fail") {
          await this.agents!.invoke("scheduler", "approve_content", {
            contentId: item.id,
          });
        }
      }
    }
  }

  private async retryFailedPublishes(): Promise<void> {
    const failed = await this.jobs.list("failed", 20);
    for (const job of failed.slice(0, 5)) {
      if (job.attempts < 5) {
        await this.agents!.invoke("publisher", "publish_now", { jobId: job.id });
      }
    }
  }

  private async maybeDailyReport(): Promise<void> {
    const hour = new Date().getUTCHours();
    // Run report roughly once per day around autonomy ticks near 14:00 UTC
    if (hour !== 14) return;
    await this.agents!.invoke("analytics", "generate_report", { period: "daily" });
  }
}

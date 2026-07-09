import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName } from "../../types/domain";
import { ContentRepository } from "../../db/repositories/content.repo";
import { TaskRepository } from "../../db/repositories/mission.repo";
import { PublishJobRepository } from "../../db/repositories/metrics.repo";
import { queueManager, QUEUE_NAMES } from "../../core/queue";
import { config } from "../../config";

/**
 * Scheduler — queues approved work, reminders, publish coordination.
 */
export class SchedulerAgent extends BaseAgent {
  readonly name: AgentName = "scheduler";
  private content = new ContentRepository();
  private tasks = new TaskRepository();
  private jobs = new PublishJobRepository();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "scheduler" }) });
  }

  protected setup(): void {
    this.subscribe("content.approved", async ({ contentId }) => {
      await this.queueContentForPublish(contentId);
    });

    this.subscribe("compliance.reviewed", async (payload) => {
      if (payload.verdict === "pass" && config.publish.autoApproved) {
        await this.queueContentForPublish(payload.contentId);
      }
    });

    this.subscribe("task.created", async ({ task }) => {
      if (task.agent !== this.name) return;
      const continuous = Boolean(task.payload.continuous);
      if (continuous) {
        const approved = await this.content.list({ status: "approved", limit: 100 });
        const awaiting = await this.content.list({
          status: "awaiting_approval",
          limit: 100,
        });
        // Auto-approve awaiting if configured
        let queued = 0;
        for (const item of approved) {
          await this.queueContentForPublish(item.id);
          queued++;
        }
        await this.emit("task.completed", {
          task: {
            ...task,
            status: "completed",
            result: { queued, awaitingApproval: awaiting.length, continuous },
          },
        });
      }
    });

    // Tick every 30s
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await super.stop();
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "queue_publish") {
      const contentId = String(input.contentId ?? "");
      const jobs = await this.queueContentForPublish(contentId);
      return { ok: true, data: { jobs } };
    }

    if (action === "approve_content") {
      const contentId = String(input.contentId ?? "");
      const updated = await this.content.update(contentId, { status: "approved" });
      if (!updated) return { ok: false, message: "content not found" };
      await this.emit("content.approved", { contentId });
      return { ok: true, data: { content: updated } };
    }

    if (action === "tick") {
      await this.tick();
      return { ok: true, message: "tick executed" };
    }

    if (action === "upcoming") {
      const items = await this.content.upcoming(Number(input.limit ?? 20));
      return { ok: true, data: { items } };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async queueContentForPublish(contentId: string) {
    const item = await this.content.findById(contentId);
    if (!item) return [];
    if (item.status === "rejected") return [];

    if (
      config.publish.requireCompliance &&
      item.complianceVerdict === "fail"
    ) {
      this.log.warn({ contentId }, "skip publish — compliance fail");
      return [];
    }

    const created = [];
    for (const platform of item.platforms) {
      const job = await this.jobs.create({
        contentId: item.id,
        platform,
        scheduledFor: item.scheduledFor ?? new Date(),
      });

      const delayMs = Math.max(
        0,
        (item.scheduledFor?.getTime() ?? Date.now()) - Date.now()
      );

      await queueManager.enqueue(
        QUEUE_NAMES.PUBLISH,
        { jobId: job.id, contentId: item.id, platform },
        { delayMs, jobId: `publish-${job.id}` }
      );

      await this.emit("publish.queued", { job });
      created.push(job);
    }

    if (item.status !== "approved") {
      await this.content.update(item.id, { status: "approved" });
    }

    return created;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    await this.emit("scheduler.tick", { at: now });

    const dueTasks = await this.tasks.dueTasks(now);
    for (const task of dueTasks) {
      await this.emit("scheduler.reminder", {
        taskId: task.id,
        message: `Task due: ${task.title}`,
      });
      await this.tasks.update(task.id, { status: "in_progress" });
    }

    // Ensure due publish jobs are in queue
    const dueJobs = await this.jobs.due(now);
    for (const job of dueJobs) {
      await queueManager.enqueue(
        QUEUE_NAMES.PUBLISH,
        { jobId: job.id, contentId: job.contentId, platform: job.platform },
        { jobId: `publish-${job.id}-retry` }
      );
    }
  }
}

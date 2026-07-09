import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName, PlatformId } from "../../types/domain";
import { ContentRepository } from "../../db/repositories/content.repo";
import { PublishJobRepository } from "../../db/repositories/metrics.repo";
import { queueManager, QUEUE_NAMES } from "../../core/queue";
import { pluginRegistry } from "../../core/plugin";
import type { IPlatformAdapter, PublishResult } from "../../services/platform.types";
import { createDefaultAdapters } from "../../services/platforms";

/**
 * Publisher — continuous posting to allowed adult platforms.
 * Uses platform adapters (plugins). Respects compliance + approval gates upstream.
 */
export class PublisherAgent extends BaseAgent {
  readonly name: AgentName = "publisher";
  private content = new ContentRepository();
  private jobs = new PublishJobRepository();
  private adapters = new Map<PlatformId, IPlatformAdapter>();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "publisher" }) });
  }

  protected setup(): void {
    // Register built-in adapters + any plugin platforms
    for (const adapter of createDefaultAdapters()) {
      this.adapters.set(adapter.platform, adapter);
    }
    for (const id of pluginRegistry.listPlatforms()) {
      const a = pluginRegistry.getPlatform<IPlatformAdapter>(id);
      if (a) this.adapters.set(id as PlatformId, a);
    }

    queueManager.startWorker<{
      jobId: string;
      contentId: string;
      platform: PlatformId;
    }>(QUEUE_NAMES.PUBLISH, async (data) => {
      await this.executePublish(data.jobId, data.contentId, data.platform);
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "publish_now") {
      const jobId = String(input.jobId ?? "");
      const job = await this.jobs.findById(jobId);
      if (!job) return { ok: false, message: "job not found" };
      await this.executePublish(job.id, job.contentId, job.platform);
      const updated = await this.jobs.findById(jobId);
      return { ok: true, data: { job: updated } };
    }

    if (action === "list_jobs") {
      const jobs = await this.jobs.list(input.status as never);
      return { ok: true, data: { jobs } };
    }

    if (action === "list_platforms") {
      return {
        ok: true,
        data: {
          platforms: [...this.adapters.keys()].map((p) => ({
            id: p,
            enabled: this.adapters.get(p)?.isEnabled() ?? false,
          })),
        },
      };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async executePublish(
    jobId: string,
    contentId: string,
    platform: PlatformId
  ): Promise<void> {
    const job = await this.jobs.findById(jobId);
    const item = await this.content.findById(contentId);
    if (!job || !item) {
      this.log.error({ jobId, contentId }, "publish missing job or content");
      return;
    }

    if (item.complianceVerdict === "fail") {
      await this.jobs.update(jobId, {
        status: "rejected",
        error: "compliance fail",
        completedAt: new Date(),
      });
      await this.emit("publish.failed", {
        jobId,
        platform,
        error: "compliance fail",
      });
      return;
    }

    const adapter = this.adapters.get(platform);
    if (!adapter || !adapter.isEnabled()) {
      await this.jobs.update(jobId, {
        status: "failed",
        error: `platform adapter unavailable: ${platform}`,
        attempts: job.attempts + 1,
      });
      await this.emit("publish.failed", {
        jobId,
        platform,
        error: `adapter unavailable: ${platform}`,
      });
      return;
    }

    await this.jobs.update(jobId, {
      status: "in_progress",
      attempts: job.attempts + 1,
    });
    await this.emit("publish.started", { jobId, platform });

    try {
      const result: PublishResult = await adapter.publish({
        title: item.title,
        body: item.body,
        caption: item.caption,
        mediaUrls: item.mediaUrls,
        trafficUrl: item.trafficUrl,
        tags: item.tags,
      });

      const updated = await this.jobs.update(jobId, {
        status: "completed",
        externalId: result.externalId,
        externalUrl: result.externalUrl,
        completedAt: new Date(),
        error: null,
      });

      await this.content.update(contentId, {
        status: "completed",
        publishedAt: new Date(),
      });

      if (updated) await this.emit("publish.completed", { job: updated });
      this.log.info({ jobId, platform, externalUrl: result.externalUrl }, "published");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.jobs.update(jobId, {
        status: "failed",
        error: message,
      });
      await this.emit("publish.failed", { jobId, platform, error: message });
      this.log.error({ err, jobId, platform }, "publish failed");
    }
  }
}

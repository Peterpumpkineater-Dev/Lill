import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName, MemoryScope } from "../../types/domain";
import { config } from "../../config";

/**
 * Memory Manager — brand voice, campaigns, audience, preferences.
 */
export class MemoryManagerAgent extends BaseAgent {
  readonly name: AgentName = "memory-manager";

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "memory-manager" }) });
  }

  protected setup(): void {
    this.subscribe("task.created", async ({ task }) => {
      if (task.agent !== this.name) return;
      const voice = await this.memory.brandVoice();
      const audience = await this.memory.recall("audience.insights.default", "audience");
      const traffic = await this.memory.recall("brand.primary_traffic_url", "brand");

      await this.memory.setWorking(task.missionId ?? task.id, "context", {
        voice: voice || config.brand.voice,
        audience: audience?.value ?? null,
        trafficUrl: traffic?.value ?? config.brand.primaryTrafficUrl,
      });

      await this.emit("task.completed", {
        task: {
          ...task,
          status: "completed",
          result: {
            voiceLoaded: Boolean(voice),
            audienceLoaded: Boolean(audience),
          },
        },
      });
    });

    this.subscribe("report.generated", async ({ report }) => {
      await this.memory.remember({
        scope: "campaign",
        key: `report.${report.period}.${report.id}`,
        value: {
          summary: report.summary,
          kpis: report.kpis,
          trends: report.trends,
        },
        tags: ["report", report.period],
        importance: 0.7,
      });
    });

    this.subscribe("publish.completed", async ({ job }) => {
      await this.memory.remember({
        scope: "campaign",
        key: `publish.success.${job.id}`,
        value: {
          platform: job.platform,
          contentId: job.contentId,
          externalUrl: job.externalUrl,
        },
        tags: ["publish", job.platform, "success"],
        importance: 0.6,
      });
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "remember") {
      const entry = await this.memory.remember({
        scope: (input.scope as MemoryScope) ?? "preference",
        key: String(input.key),
        value: input.value,
        tags: (input.tags as string[]) ?? [],
        importance: Number(input.importance ?? 0.5),
      });
      return { ok: true, data: { entry } };
    }

    if (action === "recall") {
      const entry = await this.memory.recall(
        String(input.key),
        input.scope as MemoryScope | undefined
      );
      return { ok: true, data: { entry } };
    }

    if (action === "search") {
      const entries = await this.memory.search({
        scope: input.scope as MemoryScope | undefined,
        tags: input.tags as string[] | undefined,
        keyPrefix: input.keyPrefix ? String(input.keyPrefix) : undefined,
        limit: Number(input.limit ?? 50),
      });
      return { ok: true, data: { entries } };
    }

    if (action === "set_brand_voice") {
      await this.memory.setBrandVoice(String(input.voice ?? ""));
      return { ok: true, message: "brand voice updated" };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }
}

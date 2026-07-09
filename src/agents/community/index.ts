import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName, PlatformId } from "../../types/domain";
import { DraftRepository } from "../../db/repositories/metrics.repo";
import { config } from "../../config";

/**
 * Community Assistant — drafts ONLY. Never posts automatically.
 */
export class CommunityAgent extends BaseAgent {
  readonly name: AgentName = "community";
  private drafts = new DraftRepository();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "community" }) });
  }

  protected setup(): void {
    this.subscribe("task.created", async ({ task }) => {
      if (task.agent !== this.name) return;
      const suggestions = await this.suggestEngagements(
        String(task.payload.goal ?? "grow engagement")
      );
      await this.emit("task.completed", {
        task: {
          ...task,
          status: "completed",
          result: { suggestions },
        },
      });
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "draft_reply") {
      const platform = (input.platform as PlatformId) ?? "reddit";
      const threadId = String(input.threadId ?? "unknown");
      const originalMessage = String(input.originalMessage ?? "");
      if (!originalMessage) return { ok: false, message: "originalMessage required" };

      const draftText = await this.composeDraft(originalMessage);
      const draft = await this.drafts.create({
        platform,
        threadId,
        originalMessage,
        draft: draftText,
      });
      await this.emit("community.draft_created", { draft });
      return {
        ok: true,
        message: "Draft created for human review — will not auto-post",
        data: { draft },
      };
    }

    if (action === "list_drafts") {
      const list = await this.drafts.list(input.status as never);
      return { ok: true, data: { drafts: list } };
    }

    if (action === "approve_draft") {
      const id = String(input.id ?? "");
      const draft = await this.drafts.updateStatus(id, "approved");
      if (!draft) return { ok: false, message: "draft not found" };
      await this.emit("community.draft_updated", { draft });
      return {
        ok: true,
        message: "Draft approved — send manually or via your platform client",
        data: { draft },
      };
    }

    if (action === "reject_draft") {
      const id = String(input.id ?? "");
      const draft = await this.drafts.updateStatus(id, "rejected");
      if (!draft) return { ok: false, message: "draft not found" };
      await this.emit("community.draft_updated", { draft });
      return { ok: true, data: { draft } };
    }

    if (action === "suggest_engagement") {
      const suggestions = await this.suggestEngagements(String(input.goal ?? ""));
      return { ok: true, data: { suggestions } };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async composeDraft(original: string): Promise<string> {
    const voice = (await this.memory.brandVoice()) || config.brand.voice;
    const lower = original.toLowerCase();

    if (lower.includes("price") || lower.includes("how much")) {
      return `Thanks for asking! Details are on my page — happy to help if you have questions. (${voice})`;
    }
    if (lower.includes("love") || lower.includes("amazing") || lower.includes("hot")) {
      return `That means a lot — thank you 💕 More coming soon. (${voice})`;
    }
    if (lower.includes("?")) {
      return `Great question! I'll share more on that soon — stay tuned. (${voice})`;
    }
    return `Appreciate you! Thanks for the message ✨ (${voice})`;
  }

  private async suggestEngagements(goal: string): Promise<string[]> {
    return [
      "Reply to top 10 commenters from last 24h (drafts only)",
      "Thank new subscribers with a welcome template draft",
      "Engage in 2–3 relevant subreddit threads with value-first comments (manual send)",
      `Align engagement tone with goal: ${goal || "retention + traffic"}`,
      "Never auto-DM; queue human-approved drafts only",
    ];
  }
}

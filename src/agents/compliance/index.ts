import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName, ComplianceVerdict } from "../../types/domain";
import { ContentRepository } from "../../db/repositories/content.repo";
import { config } from "../../config";

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; flag: string }> = [
  { pattern: /\b(underage|minor|teen\s*girl|cp)\b/i, flag: "prohibited_age_related" },
  { pattern: /\b(non-?consensual|revenge\s*porn|deepfake)\b/i, flag: "prohibited_consent" },
  { pattern: /\b(drugs?\s*for\s*sale|illegal\s*substance)\b/i, flag: "prohibited_illegal" },
  { pattern: /\b(guaranteed\s*income|get\s*rich\s*quick)\b/i, flag: "deceptive_claims" },
];

/**
 * Compliance Agent — policy flags + pre-publish review.
 */
export class ComplianceAgent extends BaseAgent {
  readonly name: AgentName = "compliance";
  private content = new ContentRepository();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "compliance" }) });
  }

  protected setup(): void {
    this.subscribe("content.planned", async ({ content }) => {
      if (!config.publish.requireCompliance) return;
      await this.reviewContent(content.id);
    });

    this.subscribe("content.approved", async ({ contentId }) => {
      // re-check on explicit approval path
      await this.reviewContent(contentId);
    });

    this.subscribe("task.created", async ({ task }) => {
      if (task.agent !== this.name) return;
      const pending = await this.content.list({ status: "pending", limit: 50 });
      let reviewed = 0;
      for (const item of pending) {
        await this.reviewContent(item.id);
        reviewed++;
      }
      await this.emit("task.completed", {
        task: {
          ...task,
          status: "completed",
          result: { reviewed },
        },
      });
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "review") {
      const contentId = String(input.contentId ?? "");
      if (!contentId) return { ok: false, message: "contentId required" };
      const result = await this.reviewContent(contentId);
      return { ok: true, data: result };
    }

    if (action === "review_text") {
      const text = String(input.text ?? "");
      const { verdict, flags, notes } = this.analyzeText(text);
      return { ok: true, data: { verdict, flags, notes } };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async reviewContent(contentId: string) {
    const item = await this.content.findById(contentId);
    if (!item) return { contentId, verdict: "fail" as ComplianceVerdict, flags: ["not_found"], notes: "Content not found" };

    const text = `${item.title}\n${item.body}\n${item.caption}`;
    const { verdict, flags, notes } = this.analyzeText(text);

    const status =
      verdict === "pass"
        ? config.publish.autoApproved
          ? "approved"
          : "awaiting_approval"
        : verdict === "needs_review"
          ? "awaiting_approval"
          : "rejected";

    await this.content.update(contentId, {
      complianceVerdict: verdict,
      complianceNotes: notes,
      status,
    });

    await this.emit("compliance.reviewed", {
      contentId,
      verdict,
      notes,
      flags,
    });

    if (verdict === "fail") {
      await this.emit("content.rejected", { contentId, reason: notes });
    } else if (status === "approved") {
      await this.emit("content.approved", { contentId });
    }

    this.log.info({ contentId, verdict, flags }, "compliance review complete");
    return { contentId, verdict, flags, notes, status };
  }

  private analyzeText(text: string): {
    verdict: ComplianceVerdict;
    flags: string[];
    notes: string;
  } {
    const flags: string[] = [];
    for (const { pattern, flag } of BLOCKED_PATTERNS) {
      if (pattern.test(text)) flags.push(flag);
    }

    if (flags.some((f) => f.startsWith("prohibited"))) {
      return {
        verdict: "fail",
        flags,
        notes: `Blocked: ${flags.join(", ")}. Content must not violate platform or legal rules.`,
      };
    }

    if (flags.length) {
      return {
        verdict: "needs_review",
        flags,
        notes: `Manual review recommended: ${flags.join(", ")}`,
      };
    }

    // Soft checks
    if (text.length < 5) {
      return {
        verdict: "needs_review",
        flags: ["too_short"],
        notes: "Caption/body very short — confirm intentional",
      };
    }

    return {
      verdict: "pass",
      flags: [],
      notes: "No automated policy issues detected",
    };
  }
}

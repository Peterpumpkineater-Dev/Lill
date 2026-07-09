import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName } from "../../types/domain";
import { config } from "../../config";
import {
  buildLillyImagePrompt,
  createMediaAdapter,
  lillyNegativePrompt,
  type IMediaAdapter,
} from "../../services/media";
import type { BudgetService } from "../../services/budget";
import { ContentRepository } from "../../db/repositories/content.repo";

/**
 * Media Agent — generates images of Lilly (LoRA when configured).
 */
export class MediaAgent extends BaseAgent {
  readonly name: AgentName = "media";
  private adapter: IMediaAdapter = createMediaAdapter();
  private budget: BudgetService | null = null;
  private content = new ContentRepository();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "media" }) });
  }

  setBudget(budget: BudgetService): void {
    this.budget = budget;
  }

  protected setup(): void {
    this.adapter = createMediaAdapter();
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "status") {
      return {
        ok: true,
        data: {
          enabled: config.media.enabled,
          provider: this.adapter.name,
          adapterEnabled: this.adapter.isEnabled(),
          loraTrigger: config.media.loraTrigger,
          hasLora: Boolean(config.media.loraPathOrUrl),
          budget: this.budget ? await this.budget.snapshot() : null,
        },
      };
    }

    if (action === "generate_image") {
      return this.generateImage(String(input.prompt ?? input.request ?? ""));
    }

    if (action === "generate_for_content") {
      const contentId = String(input.contentId ?? "");
      const theme = String(input.theme ?? "teaser selfie");
      const gen = await this.generateImage(theme);
      if (!gen.ok || !gen.data?.url) return gen;

      if (contentId) {
        const item = await this.content.findById(contentId);
        if (item) {
          const mediaUrls = [...item.mediaUrls, String(gen.data.url)];
          await this.content.update(contentId, {
            metadata: { ...item.metadata, mediaGenerated: true },
          });
          // update media_urls via raw path — update() doesn't include mediaUrls; use create metadata
          await this.attachMedia(contentId, String(gen.data.url));
          return {
            ok: true,
            data: { ...gen.data, contentId, mediaUrls },
          };
        }
      }
      return gen;
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async attachMedia(contentId: string, url: string): Promise<void> {
    const item = await this.content.findById(contentId);
    if (!item) return;
    await this.content.update(contentId, {
      mediaUrls: [...item.mediaUrls, url],
      metadata: {
        ...item.metadata,
        generatedMediaUrl: url,
        mediaGenerated: true,
      },
    });
  }

  private async generateImage(request: string): Promise<AgentHandleResult> {
    if (!request.trim()) {
      return { ok: false, message: "prompt/request required" };
    }

    if (this.budget) {
      const gate = await this.budget.canGenerateImage();
      if (!gate.ok) {
        return {
          ok: false,
          message: `daily image budget reached (${gate.used}/${gate.limit})`,
          data: gate,
        };
      }
    }

    // Quick compliance on prompt
    const lower = request.toLowerCase();
    if (/\b(underage|minor|child|loli|shota)\b/i.test(lower)) {
      return { ok: false, message: "prompt blocked by compliance" };
    }

    const prompt = buildLillyImagePrompt(request);
    try {
      const result = await this.adapter.generateImage({
        prompt,
        negativePrompt: lillyNegativePrompt(),
      });
      if (this.budget) await this.budget.recordImage(1);
      this.log.info(
        { provider: result.provider, model: result.model },
        "image generated"
      );
      return {
        ok: true,
        data: {
          url: result.url,
          provider: result.provider,
          model: result.model,
          prompt,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error({ err }, "image generation failed");
      return { ok: false, message };
    }
  }
}

import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName, ContentType, PlatformId } from "../../types/domain";
import { ContentRepository } from "../../db/repositories/content.repo";
import { config } from "../../config";
import { reasoningService } from "../../services/reasoning";

/**
 * Content Planner — calendars, captions, media organization, schedules.
 * Always attaches primary traffic URL when generating promo posts.
 */
export class ContentPlannerAgent extends BaseAgent {
  readonly name: AgentName = "content-planner";
  private content = new ContentRepository();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "content-planner" }) });
  }

  protected setup(): void {
    this.subscribe("task.created", async ({ task }) => {
      if (task.agent !== this.name) return;
      if (task.status !== "pending") return;

      const days = Number(task.payload.days ?? 7);
      const items = await this.generateCalendar({
        goal: String(task.payload.goal ?? task.description),
        days,
        platforms: (task.payload.platforms as PlatformId[]) ?? [
          "reddit",
          "twitter",
          "fansly",
        ],
      });

      await this.emit("task.completed", {
        task: {
          ...task,
          status: "completed",
          result: { contentIds: items.map((i) => i.id), count: items.length },
        },
      });
    });
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "plan_calendar") {
      const items = await this.generateCalendar({
        goal: String(input.goal ?? "Grow traffic to primary account"),
        days: Number(input.days ?? 7),
        platforms: (input.platforms as PlatformId[]) ?? ["reddit", "twitter", "fansly"],
      });
      return { ok: true, data: { items } };
    }

    if (action === "suggest_caption") {
      const caption = await this.suggestCaption({
        topic: String(input.topic ?? "new drop"),
        contentType: (input.contentType as ContentType) ?? "image",
        includeTraffic: input.includeTraffic !== false,
      });
      return { ok: true, data: { caption } };
    }

    if (action === "list_content") {
      const items = await this.content.list({
        status: input.status as never,
        limit: Number(input.limit ?? 50),
      });
      return { ok: true, data: { items } };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async generateCalendar(opts: {
    goal: string;
    days: number;
    platforms: PlatformId[];
  }) {
    const voice = (await this.memory.brandVoice()) || config.brand.voice;
    const trafficUrl = config.brand.primaryTrafficUrl;
    const intervalMin = config.publish.defaultIntervalMinutes;
    const items = [];

    const themes = [
      "teaser",
      "behind-the-scenes",
      "exclusive drop",
      "fan appreciation",
      "lifestyle",
      "promo CTA",
      "poll / question",
    ];

    let slot = Date.now() + 60 * 60 * 1000; // start in 1 hour
    const postsPerDay = Math.max(1, Math.floor((24 * 60) / intervalMin));
    const total = Math.min(opts.days * postsPerDay, 42);

    for (let i = 0; i < total; i++) {
      const theme = themes[i % themes.length];
      const isPromo = theme.includes("promo") || theme.includes("exclusive") || i % 3 === 0;
      // Bulk calendar uses heuristics; use suggest_caption action for LLM captions
      const caption = this.buildCaption(theme, voice, isPromo ? trafficUrl : null);
      const platforms = isPromo ? opts.platforms : opts.platforms.slice(0, 2);

      const item = await this.content.create({
        title: `${theme} #${i + 1}`,
        body: `Content piece for goal: ${opts.goal}`,
        caption,
        contentType: i % 4 === 0 ? "video" : "image",
        tags: [theme.replace(/\s+/g, "-"), "lilly-os", config.brand.handle],
        platforms,
        trafficUrl: isPromo ? trafficUrl : null,
        scheduledFor: new Date(slot),
        metadata: { theme, goal: opts.goal, autoPlanned: true },
      });

      await this.emit("content.planned", { content: item });
      items.push(item);
      slot += intervalMin * 60 * 1000;
    }

    this.log.info({ count: items.length, days: opts.days }, "content calendar generated");
    return items;
  }

  private buildCaption(theme: string, voice: string, trafficUrl: string | null): string {
    const hooks: Record<string, string> = {
      teaser: "Something new is coming…",
      "behind-the-scenes": "A little BTS for you ✨",
      "exclusive drop": "Just dropped something exclusive",
      "fan appreciation": "You make this so fun — thank you",
      lifestyle: "Mood today",
      "promo CTA": "Full set waiting for you",
      "poll / question": "Quick question for you…",
    };
    const hook = hooks[theme] ?? "New post";
    const cta = trafficUrl ? `\n\n🔗 ${trafficUrl}` : "";
    return `${hook}\n\n(${voice})${cta}`;
  }

  private async suggestCaption(opts: {
    topic: string;
    contentType: ContentType;
    includeTraffic: boolean;
  }): Promise<string> {
    const voice = (await this.memory.brandVoice()) || config.brand.voice;
    const url = opts.includeTraffic ? config.brand.primaryTrafficUrl : null;

    if (reasoningService.enabled) {
      const llm = await reasoningService.complete({
        system: `You write short social captions for adult creator @${config.brand.handle}. Voice: ${voice}. No illegal content. No underage references.`,
        prompt: `Write one caption for theme/topic "${opts.topic}" (${opts.contentType}). ${url ? `Include traffic CTA link: ${url}` : "No traffic link."} Max 280 chars for social, longer OK for Fansly.`,
        temperature: 0.8,
      });
      if (llm?.trim()) return llm.trim();
    }

    return this.buildCaption(opts.topic, voice, url);
  }
}

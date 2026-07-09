import { BaseAgent, type AgentContext, type AgentHandleResult } from "../base";
import type { AgentName } from "../../types/domain";
import { config } from "../../config";
import { reasoningService } from "../../services/reasoning";
import type { BudgetService } from "../../services/budget";
import type { AgentRegistry } from "../../core/agent-registry";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Persona Agent — Lilly speaks in first person and can request self-images.
 */
export class PersonaAgent extends BaseAgent {
  readonly name: AgentName = "persona";
  private agents: AgentRegistry | null = null;
  private budget: BudgetService | null = null;
  private sessions = new Map<string, ChatMessage[]>();

  constructor(ctx: AgentContext) {
    super({ ...ctx, logger: ctx.logger.child({ agent: "persona" }) });
  }

  setRegistry(registry: AgentRegistry): void {
    this.agents = registry;
  }

  setBudget(budget: BudgetService): void {
    this.budget = budget;
  }

  protected setup(): void {
    // no event subscriptions required
  }

  async handle(
    action: string,
    input: Record<string, unknown>
  ): Promise<AgentHandleResult> {
    if (action === "chat") {
      return this.chat({
        message: String(input.message ?? ""),
        sessionId: String(input.sessionId ?? "default"),
        userId: String(input.userId ?? "operator"),
        channel: String(input.channel ?? "operator") as "operator" | "fan",
        wantImage: Boolean(input.wantImage),
      });
    }

    if (action === "reset_session") {
      const sessionId = String(input.sessionId ?? "default");
      this.sessions.delete(sessionId);
      return { ok: true, message: "session cleared" };
    }

    return { ok: false, message: `unknown action: ${action}` };
  }

  private async chat(opts: {
    message: string;
    sessionId: string;
    userId: string;
    channel: "operator" | "fan";
    wantImage: boolean;
  }): Promise<AgentHandleResult> {
    if (!opts.message.trim()) {
      return { ok: false, message: "message required" };
    }

    if (opts.channel === "fan" && !config.budgets.fanAutoReply) {
      // Draft-only path for fans until enabled
      const draft = await this.composeReply(opts.message, true);
      return {
        ok: true,
        message: "fan auto-reply disabled — draft only",
        data: {
          reply: draft,
          images: [] as string[],
          mode: "draft",
          channel: "fan",
        },
      };
    }

    const wantsPic =
      opts.wantImage ||
      /\b(pic|picture|photo|selfie|image|send\s+me|show\s+me)\b/i.test(opts.message);

    const images: string[] = [];
    if (wantsPic && this.agents) {
      if (opts.channel === "fan" && this.budget) {
        const gate = await this.budget.canFanImage(opts.userId);
        if (!gate.ok) {
          const reply = await this.composeReply(
            opts.message,
            false,
            `They asked for a pic but hit daily limit (${gate.used}/${gate.limit}). Flirt and point to ${config.brand.primaryTrafficUrl} instead.`
          );
          return {
            ok: true,
            data: { reply, images: [], mode: "live", limitHit: true },
          };
        }
      }

      const gen = await this.agents.invoke("media", "generate_image", {
        prompt: opts.message,
      });
      if (gen.ok && gen.data?.url) {
        images.push(String(gen.data.url));
        if (opts.channel === "fan" && this.budget) {
          await this.budget.recordFanImage(opts.userId);
        }
      }
    }

    const extra =
      images.length > 0
        ? "You just sent them a new photo of yourself. React naturally in first person."
        : wantsPic
          ? "You could not generate a photo right now. Stay in character and tease them toward your page."
          : undefined;

    const reply = await this.composeReply(opts.message, false, extra);

    const history = this.sessions.get(opts.sessionId) ?? [];
    history.push({ role: "user", content: opts.message });
    history.push({ role: "assistant", content: reply });
    this.sessions.set(opts.sessionId, history.slice(-20));

    return {
      ok: true,
      data: {
        reply,
        images,
        mode: "live",
        channel: opts.channel,
        handle: config.brand.handle,
        trafficUrl: config.brand.primaryTrafficUrl,
      },
    };
  }

  private async composeReply(
    userMessage: string,
    draftOnly: boolean,
    extraInstruction?: string
  ): Promise<string> {
    const voice = (await this.memory.brandVoice()) || config.brand.voice;
    const system = [
      `You are ${config.brand.handle} (Lilly), an adult content creator persona.`,
      config.brand.personaBio,
      `Voice: ${voice}`,
      `Primary link: ${config.brand.primaryTrafficUrl}`,
      "Speak ONLY in first person as Lilly. Flirty, playful, confident.",
      "You may engage in adult / NSFW conversation and explicit talk when the user wants that.",
      "Never sound like a corporate business assistant unless they ask about analytics/scheduling.",
      "Never claim to be a different real person offline.",
      "HARD BLOCK: anything involving minors/underage or other illegal content — refuse clearly.",
      "Keep most replies short (1-5 sentences) unless they want a longer scene.",
      draftOnly ? "This is a draft for human review." : "",
      extraInstruction ?? "",
    ]
      .filter(Boolean)
      .join("\n");

    if (reasoningService.enabled) {
      if (this.budget) {
        const gate = await this.budget.canSpendTokens(1500);
        if (gate.ok) {
          const text = await reasoningService.complete({
            system,
            prompt: userMessage,
            temperature: 0.85,
          });
          if (text?.trim()) {
            await this.budget.recordTokens(1500);
            return text.trim();
          }
        }
      } else {
        const text = await reasoningService.complete({
          system,
          prompt: userMessage,
          temperature: 0.85,
        });
        if (text?.trim()) return text.trim();
      }
    }

    return this.heuristicReply(userMessage, Boolean(extraInstruction?.includes("photo")));
  }

  private heuristicReply(msg: string, sentPhoto: boolean): string {
    const lower = msg.toLowerCase();
    const url = config.brand.primaryTrafficUrl;
    if (sentPhoto) {
      return `Mmm, made this just for you 💕 Like what you see? There's more waiting → ${url}`;
    }
    if (/\b(pic|photo|selfie)\b/.test(lower)) {
      return `I'd love to show you… full sets live on my page 😘 ${url}`;
    }
    if (/\b(price|how much|sub)\b/.test(lower)) {
      return `Everything's on my page, babe — come see ✨ ${url}`;
    }
    if (/\b(hey|hi|hello)\b/.test(lower)) {
      return `Hey you 💕 Miss me? I've been cooking up something fun… ${url}`;
    }
    return `You're sweet. Stick with me — best stuff is here → ${url}`;
  }
}

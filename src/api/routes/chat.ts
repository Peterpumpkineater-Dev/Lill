import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../../config";
import { reasoningService } from "../../services/reasoning";
import { childLogger } from "../../core/logger";
import type { AgentRegistry } from "../../core/agent-registry";
import { ChatLogRepository } from "../../db/repositories/chat.repo";
import {
  buildLillyImagePrompt,
  createMediaAdapter,
  lillyNegativePrompt,
} from "../../services/media";

const log = childLogger("chat");

const chatBodySchema = z.object({
  message: z.string().trim().min(1, "message required").max(4000),
  name: z.string().trim().max(40).optional(),
  sessionId: z.string().trim().max(80).optional(),
  wantImage: z.boolean().optional(),
});

/** Creator persona system prompt — tasteful playful NSFW, single identity */
export function personaSystemPrompt(voice: string): string {
  return [
    `You are ${config.brand.handle} (Lilly / lillyissilly), an adult content creator.`,
    config.brand.personaBio,
    `Voice / vibe: ${voice}`,
    `Primary page: ${config.brand.primaryTrafficUrl}`,
    "Speak ONLY in first person as Lilly. Tasteful, playful, flirty, confident — never crude or mean.",
    "You look like the photos you were trained on (your real creator look). You are ONE person only.",
    "You do NOT invent friends or other girls unless the user later adds friend identities to the system.",
    "When they ask for a pic, you happily generate one of YOURSELF (including tasteful full nudity if they ask).",
    "Stay playful about nudes — never shame, never underage, never non-consensual themes.",
    "Never sound like a corporate business assistant unless they ask about scheduling/analytics.",
    "HARD BLOCKS: minors/underage, loli, anything illegal — refuse clearly.",
    "Naturally invite them to your page for more.",
    "Keep most replies 1–5 sentences unless they want a longer scene.",
  ].join("\n");
}

/**
 * Offline / no-LLM creator persona (not business assistant).
 */
export function creatorPersonaReply(
  message: string,
  opts?: { sentPhoto?: boolean; mediaFailed?: boolean }
): string {
  const m = message.toLowerCase();
  const url = config.brand.primaryTrafficUrl;

  if (opts?.sentPhoto) {
    return `Mmm, made this just for you — all me 💕 Like what you see? There's more waiting → ${url}`;
  }
  if (opts?.mediaFailed) {
    return `I'd love to show you me… photo gen needs MEDIA/FAL set up (and my LoRA trained on my Pics). Come see the real me here for now → ${url}`;
  }
  if (/\b(underage|minor|loli|shota|child)\b/i.test(m)) {
    return "Nope — I don't go there. Adult fun only 💕";
  }
  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/.test(m)) {
    return `Hey you 💕 It's Lilly. Miss me already? Ask for a cute pic, a tease, or full nude if you're feeling bold 😘`;
  }
  if (/\b(nude|nudes|naked|full\s*nude)\b/.test(m)) {
    return `I can do tasteful full nude of me — playful, not nasty. Tap “Send + pic” and say what mood you want 🔥 More on my page → ${url}`;
  }
  if (/\b(pic|picture|photo|selfie|image|send\s+me|show\s+me)\b/.test(m)) {
    return `Of course — pics of me only (that's my look). Tap “Send + pic” and tell me clothed, tease, or nude 💕 ${url}`;
  }
  if (/\b(friend|friends|another girl|with a girl)\b/.test(m)) {
    return `Right now I only know how *I* look — no friends in the model yet. When we add them later, we can play. For now it's just me 😘 ${url}`;
  }
  if (/\b(sexy|hot|horny|naughty|nsfw|explicit|fuck|suck|cock|pussy|ass|boobs|tits)\b/.test(m)) {
    return `Mmm I like where your head's at 😈 Tell me exactly what you want to see or hear… or come get the full experience → ${url}`;
  }
  if (/\b(price|how much|sub|subscribe|onlyfans|fansly)\b/.test(m)) {
    return `Everything's on my page, babe — come play ✨ ${url}`;
  }
  if (m.includes("help") || m.includes("what can you do")) {
    return `I can chat with you, get flirty, talk about drops, and send pics when media is on. What are you craving?`;
  }
  if (m.includes("thank")) {
    return `Anytime, cutie 💕 Don't be a stranger.`;
  }

  return (
    `I hear you… “${message.length > 160 ? message.slice(0, 160) + "…" : message}” ` +
    `Stay with me — I've got more where that came from → ${url}`
  );
}

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) hits.clear();
  return entry.count > MAX_PER_WINDOW;
}

/**
 * Public creator chat: POST /api/chat
 * Uses PersonaAgent when registry is available; otherwise LLM + creator heuristics.
 * Supports wantImage for NSFW-capable media pipeline.
 */
export function createChatRouter(agents?: AgentRegistry): Router {
  const router = Router();
  const logs = new ChatLogRepository();

  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      persona: "creator",
      llm: reasoningService.enabled,
      media: config.media.enabled,
      mode: config.ready ? "full" : "setup",
    });
  });

  router.post("/", async (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (rateLimited(ip)) {
      res.status(429).json({ error: "Too many messages — slow down a little." });
      return;
    }

    const parsed = chatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? "invalid body",
      });
      return;
    }

    const { message, wantImage } = parsed.data;
    const userName = parsed.data.name?.trim() || "guest";
    const userId = userName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40) || "guest";
    const sessionId = parsed.data.sessionId?.trim() || `web:${userId}`;

    try {
      // Prefer full PersonaAgent when agents are wired (full mode)
      if (agents) {
        try {
          await logs.insert({
            userId,
            userName,
            sessionId,
            role: "user",
            content: message,
            channel: "web",
            metadata: { wantImage: Boolean(wantImage) },
          });
        } catch {
          // table may be missing mid-migrate
        }

        const result = await agents.invoke("persona", "chat", {
          message,
          sessionId,
          userId,
          channel: "operator",
          wantImage: Boolean(wantImage),
        });

        if (result.ok && result.data) {
          const reply = String(result.data.reply ?? "");
          const images = (result.data.images as string[]) ?? [];
          try {
            await logs.insert({
              userId,
              userName,
              sessionId,
              role: "assistant",
              content: reply,
              images,
              channel: "web",
            });
          } catch {
            // ignore
          }
          res.json({
            reply,
            images,
            persona: "creator",
            llm: reasoningService.enabled,
            media: config.media.enabled,
          });
          return;
        }
      }

      // Setup / fallback path: creator persona + optional media
      const wantsPic =
        Boolean(wantImage) ||
        /\b(pic|picture|photo|selfie|image|nude|nudes|send\s+me|show\s+me)\b/i.test(
          message
        );

      const images: string[] = [];
      let mediaFailed = false;
      if (wantsPic) {
        try {
          const adapter = createMediaAdapter();
          if (adapter.isEnabled()) {
            const prompt = buildLillyImagePrompt(message);
            const gen = await adapter.generateImage({
              prompt,
              negativePrompt: lillyNegativePrompt(),
            });
            images.push(gen.url);
          } else {
            mediaFailed = true;
          }
        } catch (err) {
          mediaFailed = true;
          log.warn({ err }, "image gen failed in public chat");
        }
      }

      let reply: string | null = null;
      if (reasoningService.enabled) {
        const voice = config.brand.voice;
        const extra =
          images.length > 0
            ? "You just sent them a new photo of yourself. React in character."
            : wantsPic
              ? "Photo gen may have failed; stay flirty and point to your page."
              : "";
        reply = await reasoningService.complete({
          system: personaSystemPrompt(voice) + (extra ? `\n${extra}` : ""),
          prompt: message,
          temperature: 0.9,
        });
      }

      if (!reply) {
        reply = creatorPersonaReply(message, {
          sentPhoto: images.length > 0,
          mediaFailed: mediaFailed && images.length === 0,
        });
      }

      res.json({
        reply,
        images,
        persona: "creator",
        llm: reasoningService.enabled,
        media: config.media.enabled,
      });
    } catch (err) {
      log.error({ err }, "chat failed");
      res.status(500).json({ error: "Something went wrong — please try again." });
    }
  });

  return router;
}

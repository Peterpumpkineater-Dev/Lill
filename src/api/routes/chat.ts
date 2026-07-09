import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "../../config";
import { reasoningService } from "../../services/reasoning";
import { childLogger } from "../../core/logger";

const log = childLogger("chat");

const chatBodySchema = z.object({
  message: z.string().trim().min(1, "message required").max(4000, "message too long"),
});

const SYSTEM_PROMPT = [
  "You are Lilly, the friendly assistant inside Lilly OS — a business assistant for content creators.",
  "You help with content planning, scheduling, analytics questions, and general business advice.",
  "You never impersonate real people, never draft deceptive outreach, and never automate fake engagement.",
  "Keep replies short, warm, and practical.",
].join(" ");

/**
 * Deterministic fallback persona used when no LLM provider is configured.
 * Exported for unit tests.
 */
export function localPersonaReply(message: string): string {
  const m = message.toLowerCase();

  if (/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/.test(m)) {
    return "Hey! I'm Lilly, your creator business assistant. Ask me about content planning, scheduling, or analytics — or just tell me what you're working on.";
  }
  if (m.includes("help") || m.includes("what can you do")) {
    return "I can help you plan content calendars, track what's performing, draft ideas, and keep your publishing schedule organized. What would you like to start with?";
  }
  if (m.includes("health") || m.includes("status") || m.includes("online")) {
    return "I'm up and running! You can check the system status anytime at /health.";
  }
  if (m.includes("thank")) {
    return "Anytime! Let me know what else you need.";
  }
  return (
    "Got it — you said: “" +
    (message.length > 200 ? message.slice(0, 200) + "…" : message) +
    "”. I'm running in basic mode right now (no AI model connected), so my answers are simple. " +
    "Connect a model provider via LLM_API_URL + LLM_ENABLED=true for smarter replies."
  );
}

// Simple in-memory rate limit so the public endpoint can't be hammered.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, { count: number; windowStart: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  if (hits.size > 5000) hits.clear(); // safety valve
  return entry.count > MAX_PER_WINDOW;
}

/**
 * Public chat endpoint: POST /api/chat { message } -> { reply }.
 * Works in setup mode (no Postgres/Redis) and full mode alike.
 * Uses the configured LLM provider when available, otherwise a
 * deterministic Lilly persona fallback.
 */
export function createChatRouter(): Router {
  const router = Router();

  router.get("/status", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      llm: reasoningService.enabled,
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
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid body" });
      return;
    }

    const { message } = parsed.data;

    try {
      let reply: string | null = null;
      if (reasoningService.enabled) {
        reply = await reasoningService.complete({
          system: SYSTEM_PROMPT,
          prompt: message,
          temperature: 0.7,
        });
      }
      if (!reply) reply = localPersonaReply(message);

      res.json({ reply });
    } catch (err) {
      log.error({ err }, "chat failed");
      res.status(500).json({ error: "Something went wrong — please try again." });
    }
  });

  return router;
}

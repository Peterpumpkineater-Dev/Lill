import { Router, type Request, type Response } from "express";
import type { AgentRegistry } from "../../core/agent-registry";
import { config } from "../../config";
import { ChatLogRepository } from "../../db/repositories/chat.repo";
import { childLogger } from "../../core/logger";

const log = childLogger("training-chat");

/**
 * Public training chat — password + name (for 2 trainers).
 * Does not require full API_KEY.
 */
export function createTrainingChatRouter(agents: AgentRegistry): Router {
  const router = Router();
  const logs = new ChatLogRepository();

  router.get("/status", (_req, res) => {
    res.json({
      enabled: config.chat.enabled,
      ready: config.ready,
    });
  });

  router.post("/message", async (req: Request, res: Response) => {
    if (!config.chat.enabled) {
      res.status(503).json({ error: "chat disabled" });
      return;
    }
    if (!config.ready) {
      res.status(503).json({
        error: "setup incomplete",
        missing: config.missing,
        hint: "Link Postgres + Redis on Railway first",
      });
      return;
    }

    const password = String(req.body?.password ?? req.header("x-chat-password") ?? "");
    if (password !== config.chat.password) {
      res.status(401).json({ error: "invalid chat password" });
      return;
    }

    const userName = String(req.body?.name ?? "").trim().slice(0, 40);
    if (!userName) {
      res.status(400).json({ error: "name required" });
      return;
    }

    const message = String(req.body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ error: "message required" });
      return;
    }

    const userId = userName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 40);
    const sessionId = `train:${userId}`;
    const wantImage = Boolean(req.body?.wantImage);

    try {
      await logs.insert({
        userId,
        userName,
        sessionId,
        role: "user",
        content: message,
        channel: "training",
        metadata: { wantImage },
      });

      const result = await agents.invoke("persona", "chat", {
        message,
        sessionId,
        userId,
        channel: "operator",
        wantImage,
      });

      if (!result.ok) {
        res.status(400).json(result);
        return;
      }

      const reply = String(result.data?.reply ?? "");
      const images = (result.data?.images as string[]) ?? [];

      await logs.insert({
        userId,
        userName,
        sessionId,
        role: "assistant",
        content: reply,
        images,
        channel: "training",
      });

      log.info({ userName, wantImage, images: images.length }, "training chat turn");

      res.json({
        ok: true,
        reply,
        images,
        sessionId,
        userName,
      });
    } catch (err) {
      log.error({ err }, "training chat failed");
      res.status(500).json({
        error: err instanceof Error ? err.message : "chat failed",
      });
    }
  });

  return router;
}

/** Admin training export routes (API key protected) */
export function createTrainingAdminRouter(): Router {
  const router = Router();
  const logs = new ChatLogRepository();

  router.get("/chats", async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    const rows = await logs.listRecent(limit);
    res.json({ count: rows.length, total: await logs.count(), chats: rows });
  });

  router.get("/export", async (_req, res) => {
    const sessions = await logs.exportSessions(1000);
    const lines = sessions
      .filter((s) => s.messages.length >= 2)
      .map((s) =>
        JSON.stringify({
          sessionId: s.sessionId,
          userName: s.userName,
          messages: [
            {
              role: "system",
              content: `You are ${config.brand.handle}. ${config.brand.personaBio} Voice: ${config.brand.voice}`,
            },
            ...s.messages,
          ],
        })
      );

    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="lilly-chat-train-${Date.now()}.jsonl"`
    );
    res.send(lines.join("\n") + (lines.length ? "\n" : ""));
  });

  router.get("/stats", async (_req, res) => {
    res.json({
      totalMessages: await logs.count(),
      chatEnabled: config.chat.enabled,
    });
  });

  return router;
}

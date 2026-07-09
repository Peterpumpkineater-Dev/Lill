import { config } from "../config";
import { childLogger } from "../core/logger";
import { z } from "zod";

const log = childLogger("reasoning");

export interface ReasonRequest {
  system?: string;
  prompt: string;
  temperature?: number;
}

/**
 * Optional LLM adapter. When disabled, callers use deterministic heuristics.
 * OpenAI-compatible: OpenAI, OpenRouter, Grok, Ollama, vLLM, etc.
 */
export class ReasoningService {
  get enabled(): boolean {
    return Boolean(config.llm.enabled && config.llm.apiUrl);
  }

  async complete(req: ReasonRequest): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.llm.apiKey) {
        headers.Authorization = `Bearer ${config.llm.apiKey}`;
      }

      const res = await fetch(
        `${config.llm.apiUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: config.llm.model,
            temperature: req.temperature ?? 0.7,
            messages: [
              ...(req.system ? [{ role: "system", content: req.system }] : []),
              { role: "user", content: req.prompt },
            ],
          }),
        }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        log.warn({ status: res.status, body: body.slice(0, 200) }, "LLM request failed");
        return null;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      log.error({ err }, "LLM error");
      return null;
    }
  }

  /** Parse JSON from LLM; strip markdown fences; validate with Zod */
  async completeJSON<T>(
    req: ReasonRequest,
    schema: z.ZodType<T>
  ): Promise<T | null> {
    const raw = await this.complete({
      ...req,
      system: [
        req.system ??
          "You are Lilly, an adult content creator persona. Be flirty and in character. Block anything involving minors.",
        "Respond with valid JSON only. No markdown fences.",
      ].join("\n"),
      prompt: req.prompt + "\n\nReturn JSON only.",
    });
    if (!raw) return null;

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      const parsed: unknown = JSON.parse(cleaned);
      return schema.parse(parsed);
    } catch (err) {
      log.warn({ err, preview: cleaned.slice(0, 200) }, "LLM JSON parse failed");
      return null;
    }
  }
}

export const reasoningService = new ReasoningService();

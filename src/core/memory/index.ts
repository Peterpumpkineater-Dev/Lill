import type { MemoryEntry, MemoryScope } from "../../types/domain";
import type { MemoryRepository } from "../../db/repositories/memory.repo";
import type { Redis } from "ioredis";
import { childLogger } from "../logger";
import { eventBus } from "../event-bus";

const log = childLogger("memory");

export interface MemoryQuery {
  scope?: MemoryScope;
  tags?: string[];
  keyPrefix?: string;
  limit?: number;
}

/**
 * Hybrid memory:
 * - long-term: PostgreSQL (MemoryRepository)
 * - working: Redis (TTL context per mission/session)
 */
export class MemorySystem {
  constructor(
    private readonly repo: MemoryRepository,
    private readonly redis: Redis,
    private readonly prefix: string
  ) {}

  private workKey(sessionId: string, key: string): string {
    return `${this.prefix}work:${sessionId}:${key}`;
  }

  async remember(input: {
    scope: MemoryScope;
    key: string;
    value: unknown;
    tags?: string[];
    importance?: number;
    expiresAt?: Date | null;
  }): Promise<MemoryEntry> {
    const entry = await this.repo.upsert({
      scope: input.scope,
      key: input.key,
      value: input.value,
      tags: input.tags ?? [],
      importance: input.importance ?? 0.5,
      expiresAt: input.expiresAt ?? null,
    });

    await eventBus.emit(
      "memory.updated",
      { key: entry.key, scope: entry.scope },
      "memory-manager"
    );

    log.debug({ scope: entry.scope, key: entry.key }, "memory stored");
    return entry;
  }

  async recall(key: string, scope?: MemoryScope): Promise<MemoryEntry | null> {
    const entry = await this.repo.findByKey(key, scope);
    if (entry) {
      await eventBus.emit("memory.recalled", { keys: [key] }, "memory-manager");
    }
    return entry;
  }

  async search(query: MemoryQuery): Promise<MemoryEntry[]> {
    const entries = await this.repo.search(query);
    if (entries.length) {
      await eventBus.emit(
        "memory.recalled",
        { keys: entries.map((e) => e.key) },
        "memory-manager"
      );
    }
    return entries;
  }

  async forget(key: string, scope?: MemoryScope): Promise<boolean> {
    return this.repo.deleteByKey(key, scope);
  }

  /** Short-lived working memory (Redis) */
  async setWorking(
    sessionId: string,
    key: string,
    value: unknown,
    ttlSeconds = 3600
  ): Promise<void> {
    await this.redis.set(
      this.workKey(sessionId, key),
      JSON.stringify(value),
      "EX",
      ttlSeconds
    );
  }

  async getWorking<T = unknown>(sessionId: string, key: string): Promise<T | null> {
    const raw = await this.redis.get(this.workKey(sessionId, key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async clearWorking(sessionId: string): Promise<void> {
    const pattern = this.workKey(sessionId, "*");
    const keys = await this.redis.keys(pattern);
    if (keys.length) await this.redis.del(...keys);
  }

  async brandVoice(): Promise<string> {
    const entry = await this.recall("brand.voice", "brand");
    if (entry && typeof entry.value === "string") return entry.value;
    return "";
  }

  async setBrandVoice(voice: string): Promise<void> {
    await this.remember({
      scope: "brand",
      key: "brand.voice",
      value: voice,
      tags: ["voice", "brand"],
      importance: 1,
    });
  }

  async recordCampaignLesson(campaignId: string, lesson: string): Promise<void> {
    await this.remember({
      scope: "campaign",
      key: `campaign.${campaignId}.lesson.${Date.now()}`,
      value: lesson,
      tags: ["lesson", "campaign", campaignId],
      importance: 0.8,
    });
  }
}

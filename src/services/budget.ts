import type Redis from "ioredis";
import { config } from "../config";
import { childLogger } from "../core/logger";

const log = childLogger("budget");

/**
 * Daily spend guards so full autonomy cannot runaway-bill APIs.
 * Uses Redis counters when available; in-memory fallback for tests.
 */
export class BudgetService {
  private mem = new Map<string, number>();

  constructor(private readonly redis: Redis | null) {}

  private dayKey(kind: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `${config.redis.prefix}budget:${day}:${kind}`;
  }

  private async get(key: string): Promise<number> {
    if (this.redis) {
      const v = await this.redis.get(key);
      return Number(v ?? 0);
    }
    return this.mem.get(key) ?? 0;
  }

  private async incr(key: string, by = 1): Promise<number> {
    if (this.redis) {
      const n = await this.redis.incrby(key, by);
      await this.redis.expire(key, 60 * 60 * 48);
      return n;
    }
    const next = (this.mem.get(key) ?? 0) + by;
    this.mem.set(key, next);
    return next;
  }

  async imagesUsedToday(): Promise<number> {
    return this.get(this.dayKey("images"));
  }

  async tokensUsedToday(): Promise<number> {
    return this.get(this.dayKey("tokens"));
  }

  async canGenerateImage(): Promise<{ ok: boolean; used: number; limit: number }> {
    const used = await this.imagesUsedToday();
    const limit = config.budgets.dailyImages;
    return { ok: used < limit, used, limit };
  }

  async recordImage(count = 1): Promise<void> {
    const n = await this.incr(this.dayKey("images"), count);
    log.info({ imagesToday: n, limit: config.budgets.dailyImages }, "image budget");
  }

  async canSpendTokens(estimate: number): Promise<{ ok: boolean; used: number; limit: number }> {
    const used = await this.tokensUsedToday();
    const limit = config.budgets.dailyTokens;
    return { ok: used + estimate <= limit, used, limit };
  }

  async recordTokens(count: number): Promise<void> {
    if (count <= 0) return;
    await this.incr(this.dayKey("tokens"), count);
  }

  async fanImagesToday(userId: string): Promise<number> {
    return this.get(this.dayKey(`fanimg:${userId}`));
  }

  async canFanImage(userId: string): Promise<{ ok: boolean; used: number; limit: number }> {
    const used = await this.fanImagesToday(userId);
    const limit = config.budgets.fanImagesPerUserDay;
    return { ok: used < limit, used, limit };
  }

  async recordFanImage(userId: string): Promise<void> {
    await this.incr(this.dayKey(`fanimg:${userId}`), 1);
  }

  async snapshot(): Promise<Record<string, number>> {
    return {
      imagesToday: await this.imagesUsedToday(),
      imageLimit: config.budgets.dailyImages,
      tokensToday: await this.tokensUsedToday(),
      tokenLimit: config.budgets.dailyTokens,
    };
  }
}

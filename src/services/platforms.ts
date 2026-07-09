import { v4 as uuid } from "uuid";
import type { PlatformId } from "../types/domain";
import type { IPlatformAdapter, PublishPayload, PublishResult } from "./platform.types";
import { childLogger } from "../core/logger";

const log = childLogger("platforms");

/**
 * Simulated adapter for platforms without live credentials.
 * Logs intent and returns deterministic fake external IDs.
 * Replace with real API clients (OnlyFans partner API, Reddit, X, Fansly, etc.)
 * when credentials and ToS-compliant access are available.
 */
class SimulatedPlatformAdapter implements IPlatformAdapter {
  constructor(
    public readonly platform: PlatformId,
    private readonly enabled: boolean = true
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const externalId = `${this.platform}_${uuid().slice(0, 8)}`;
    const externalUrl = `https://sim.lilly.local/${this.platform}/${externalId}`;

    log.info(
      {
        platform: this.platform,
        externalId,
        captionPreview: payload.caption.slice(0, 80),
        trafficUrl: payload.trafficUrl,
        mediaCount: payload.mediaUrls.length,
      },
      "simulated publish (no live credentials)"
    );

    // Simulate network latency
    await new Promise((r) => setTimeout(r, 50));

    return { externalId, externalUrl, raw: { simulated: true } };
  }
}

/**
 * Adult-friendly platforms commonly used for traffic.
 * Enable only those the creator is allowed to automate under platform rules.
 */
export function createDefaultAdapters(): IPlatformAdapter[] {
  const envFlag = (key: string, fallback = true): boolean => {
    const v = process.env[key];
    if (v === undefined) return fallback;
    return v === "true";
  };

  return [
    new SimulatedPlatformAdapter("reddit", envFlag("PLATFORM_REDDIT_ENABLED", true)),
    new SimulatedPlatformAdapter("twitter", envFlag("PLATFORM_TWITTER_ENABLED", true)),
    new SimulatedPlatformAdapter("fansly", envFlag("PLATFORM_FANSLY_ENABLED", true)),
    new SimulatedPlatformAdapter("onlyfans", envFlag("PLATFORM_ONLYFANS_ENABLED", false)),
    new SimulatedPlatformAdapter("instagram", envFlag("PLATFORM_INSTAGRAM_ENABLED", false)),
    new SimulatedPlatformAdapter("tiktok", envFlag("PLATFORM_TIKTOK_ENABLED", false)),
  ];
}

/**
 * Register adapters into plugin registry at boot.
 */
export function registerPlatformPlugins(
  register: (id: string, adapter: IPlatformAdapter) => void
): void {
  for (const adapter of createDefaultAdapters()) {
    register(adapter.platform, adapter);
  }
}

import type { PlatformId } from "../types/domain";

export interface PublishPayload {
  title: string;
  body: string;
  caption: string;
  mediaUrls: string[];
  trafficUrl: string | null;
  tags: string[];
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
  raw?: unknown;
}

/**
 * Platform adapters implement real API clients in production.
 * Built-ins use safe simulation when credentials are absent.
 */
export interface IPlatformAdapter {
  readonly platform: PlatformId;
  isEnabled(): boolean;
  publish(payload: PublishPayload): Promise<PublishResult>;
}

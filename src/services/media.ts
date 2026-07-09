import { config } from "../config";
import { childLogger } from "../core/logger";

const log = childLogger("media");

export interface ImageGenRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

export interface ImageGenResult {
  url: string;
  provider: string;
  model: string;
  revisedPrompt?: string;
}

export interface IMediaAdapter {
  readonly name: string;
  isEnabled(): boolean;
  generateImage(req: ImageGenRequest): Promise<ImageGenResult>;
}

/** Placeholder until FAL_KEY / LoRA configured — returns deterministic stub URL */
class StubMediaAdapter implements IMediaAdapter {
  readonly name = "stub";
  isEnabled(): boolean {
    return true;
  }
  async generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
    const id = Buffer.from(req.prompt).toString("base64url").slice(0, 12);
    log.info({ prompt: req.prompt.slice(0, 80) }, "stub image gen");
    return {
      url: `https://placehold.co/768x1024/1a1a2e/eaeaea?text=Lilly+${id}`,
      provider: "stub",
      model: "stub",
      revisedPrompt: req.prompt,
    };
  }
}

class FalMediaAdapter implements IMediaAdapter {
  readonly name = "fal";
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
    const endpoint = `https://fal.run/${this.model}`;
    const body: Record<string, unknown> = {
      prompt: req.prompt,
      image_size: {
        width: req.width ?? 768,
        height: req.height ?? 1024,
      },
      num_images: 1,
      enable_safety_checker: false,
    };
    if (req.negativePrompt) body.negative_prompt = req.negativePrompt;
    if (config.media.loraPathOrUrl) {
      body.loras = [{ path: config.media.loraPathOrUrl, scale: 1 }];
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Fal image failed ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      images?: Array<{ url?: string }>;
      image?: { url?: string };
    };
    const url = data.images?.[0]?.url || data.image?.url;
    if (!url) throw new Error("Fal response missing image url");

    return {
      url,
      provider: "fal",
      model: this.model,
      revisedPrompt: req.prompt,
    };
  }
}

export function createMediaAdapter(): IMediaAdapter {
  if (!config.media.enabled) {
    return new StubMediaAdapter();
  }
  if (config.media.provider === "fal" && config.media.falKey) {
    return new FalMediaAdapter(config.media.falKey, config.media.falImageModel);
  }
  log.warn(
    { provider: config.media.provider },
    "media provider not fully configured — using stub"
  );
  return new StubMediaAdapter();
}

/** Build a likeness-aware prompt for Lilly */
export function buildLillyImagePrompt(userRequest: string): string {
  const trigger = config.media.loraTrigger;
  const base = [
    `photo of ${trigger}, adult woman content creator`,
    userRequest.replace(/\n/g, " ").slice(0, 400),
    "high quality, detailed, social media photo",
  ]
    .filter(Boolean)
    .join(", ");
  return base;
}

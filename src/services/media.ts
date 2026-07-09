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

export type NudityLevel = "clothed" | "tease" | "tasteful_nude" | "explicit";

export interface IMediaAdapter {
  readonly name: string;
  isEnabled(): boolean;
  generateImage(req: ImageGenRequest): Promise<ImageGenResult>;
}

/** Placeholder until FAL_KEY / LoRA configured */
class StubMediaAdapter implements IMediaAdapter {
  readonly name = "stub";
  isEnabled(): boolean {
    return true;
  }
  async generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
    const id = Buffer.from(req.prompt).toString("base64url").slice(0, 12);
    log.info({ prompt: req.prompt.slice(0, 80) }, "stub image gen — train LoRA + set FAL_KEY for real likeness");
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
      body.loras = [
        {
          path: config.media.loraPathOrUrl,
          scale: config.media.loraScale ?? 1,
        },
      ];
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

/** Infer how nude/teasing the user wants (adult only) */
export function detectNudityLevel(userRequest: string): NudityLevel {
  const m = userRequest.toLowerCase();
  if (/\b(underage|minor|loli|shota|child)\b/.test(m)) {
    return "clothed"; // will be blocked upstream
  }
  if (
    /\b(full\s*nude|fully\s*nude|naked|nude|nudes|no\s*clothes|completely\s*naked|spread|pussy|tits?\s*out|topless\s*bottomless)\b/.test(
      m
    )
  ) {
    return "tasteful_nude";
  }
  if (/\b(topless|bottomless|lingerie|underwear|bra|panties|tease|sexy|spicy|nsfw)\b/.test(m)) {
    return "tease";
  }
  if (/\b(explicit|hardcore|porn)\b/.test(m)) {
    return "explicit";
  }
  // Default pic request: playful tease; full nude only if asked
  if (/\b(pic|picture|photo|selfie|image|send|show)\b/.test(m)) {
    return "tease";
  }
  return "clothed";
}

function clothingPhrase(level: NudityLevel): string {
  switch (level) {
    case "tasteful_nude":
      return "tasteful full nudity, artistic adult nude, soft lighting, playful confident pose, elegant not vulgar";
    case "explicit":
      return "explicit adult nude, tasteful composition, playful mood, adult content";
    case "tease":
      return "sexy teasing outfit or lingerie, playful flirty pose, suggestive not crude";
    default:
      return "cute casual or stylish outfit, flirty smile, social media selfie";
  }
}

/**
 * Build a likeness-aware prompt for Lilly ONLY.
 * Identity comes from LoRA trained on Pics/ dataset (trigger token).
 * She does not invent other people's faces until separate friend LoRAs exist.
 */
export function buildLillyImagePrompt(userRequest: string): string {
  const trigger = config.media.loraTrigger;
  const level = detectNudityLevel(userRequest);

  const cleaned = userRequest
    .replace(/\n/g, " ")
    .replace(
      /\b(send me|show me|pic|picture|photo|selfie|image|please|nude|nudes|naked|full nude)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  // Identity block first — critical for LoRA
  const identity = [
    trigger,
    `solo photo of ${trigger}`,
    "one woman only",
    "same person every time",
    "consistent face and body from reference identity",
    "adult woman content creator",
  ];

  const style = [
    clothingPhrase(level),
    cleaned || "playful flirty pose looking at camera",
    "tasteful, playful personality, warm inviting vibe",
    "high quality, detailed, soft natural light",
  ];

  return [...identity, ...style].join(", ");
}

/** Shared negative prompt — protect identity + legality */
export function lillyNegativePrompt(): string {
  return [
    "child",
    "underage",
    "minor",
    "loli",
    "shota",
    "multiple people",
    "another woman",
    "different face",
    "face swap",
    "deformed",
    "ugly",
    "blurry",
    "low quality",
    "text watermark",
  ].join(", ");
}

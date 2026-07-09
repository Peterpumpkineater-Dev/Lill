/**
 * Report dataset readiness for LoRA training (no GPU required).
 * Usage: npx tsx scripts/dataset-status.ts
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "lilly-dataset");
const IMG = path.join(OUT, "images");
const RAW = path.join(ROOT, "data", "lilly-raw");
const PICS = path.join(ROOT, "Pics");
const TRIGGER = process.env.LORA_TRIGGER || "lillyissilly";

function countFiles(dir: string, ext: string[]): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isFile()) {
      const e = path.extname(name).toLowerCase();
      if (ext.includes(e)) n++;
    }
  }
  return n;
}

function main(): void {
  const images = countFiles(IMG, [".jpg", ".jpeg", ".png", ".webp"]);
  const captions = countFiles(IMG, [".txt"]);
  const rawExists = fs.existsSync(RAW);
  const picsExists = fs.existsSync(PICS);
  const manifestPath = path.join(OUT, "manifest.json");
  let manifest: { counts?: { images?: number; videos?: number } } | null = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  }

  const ready = images >= 20 && captions >= 20;
  const strong = images >= 30;

  console.log("=== Lilly dataset status (LoRA) ===");
  console.log(`Trigger token:     ${TRIGGER}`);
  console.log(`Images folder:     ${IMG}`);
  console.log(`Images:            ${images}`);
  console.log(`Captions (.txt):   ${captions}`);
  if (manifest?.counts) {
    console.log(`Manifest images:   ${manifest.counts.images ?? "?"}`);
    console.log(`Manifest videos:   ${manifest.counts.videos ?? "?"}`);
  }
  console.log(`Raw folder exists: ${rawExists} (${RAW})`);
  console.log(`Pics folder exists:${picsExists} (${PICS})`);
  console.log("");
  if (ready && strong) {
    console.log("Status: READY for LoRA training on your 5060.");
    console.log("Next: train with Kohya → upload LoRA to Fal → set Railway MEDIA_* vars.");
    console.log("See docs/TRAIN_LOCAL_SERVE_CLOUD.md");
  } else if (ready) {
    console.log("Status: OK to train (20+ images). 30–100 is better for likeness.");
  } else {
    console.log("Status: NOT READY — add more stills (need ~20+ images with captions).");
    console.log("  1) Drop media in Pics\\ or data\\lilly-raw\\");
    console.log("  2) npm run dataset:prepare");
  }
  console.log("");
  console.log("After training: cloud gens only (Fal). GPU only for the next fine-tune.");
}

main();

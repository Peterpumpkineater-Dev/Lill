/**
 * Prepare Lilly image/video dataset for LoRA training.
 * Scans data/lilly-raw, copies images, indexes videos, writes captions + manifest.
 *
 * Usage: npx tsx scripts/prepare-dataset.ts
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
/** Prefer data/lilly-raw; also accepts C:\Lilly-OS\Pics if present */
const RAW_CANDIDATES = [
  path.join(ROOT, "data", "lilly-raw"),
  path.join(ROOT, "Pics"),
];
const RAW =
  RAW_CANDIDATES.find((d) => fs.existsSync(d)) || path.join(ROOT, "data", "lilly-raw");
const OUT = path.join(ROOT, "data", "lilly-dataset");
const OUT_IMG = path.join(OUT, "images");
const OUT_VID = path.join(OUT, "videos");
const OUT_CAP = path.join(OUT, "captions");
const TRIGGER = process.env.LORA_TRIGGER || "lillyissilly";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".mkv"]);

interface ManifestEntry {
  id: string;
  type: "image" | "video";
  source: string;
  output: string;
  captionFile: string | null;
  caption: string;
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === "README.md" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function ensureDirs(): void {
  for (const d of [OUT, OUT_IMG, OUT_VID, OUT_CAP]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function defaultCaption(filename: string, type: "image" | "video"): string {
  const base = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, " ");
  if (type === "video") {
    return `${TRIGGER}, adult woman content creator, video frame, ${base}`.trim();
  }
  return `${TRIGGER}, adult woman content creator, photo, high quality, ${base}`.trim();
}

function main(): void {
  ensureDirs();
  const files = walk(RAW);
  const entries: ManifestEntry[] = [];
  let images = 0;
  let videos = 0;
  let skipped = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const rel = path.relative(RAW, file);

    if (IMAGE_EXT.has(ext)) {
      images++;
      const id = `img_${String(images).padStart(4, "0")}`;
      const destName = `${id}${ext}`;
      const dest = path.join(OUT_IMG, destName);
      fs.copyFileSync(file, dest);
      const caption = defaultCaption(rel, "image");
      const capFile = path.join(OUT_CAP, `${id}.txt`);
      fs.writeFileSync(capFile, caption, "utf8");
      // Kohya-style: caption next to image
      fs.writeFileSync(path.join(OUT_IMG, `${id}.txt`), caption, "utf8");
      entries.push({
        id,
        type: "image",
        source: rel,
        output: path.relative(OUT, dest),
        captionFile: path.relative(OUT, capFile),
        caption,
      });
      continue;
    }

    if (VIDEO_EXT.has(ext)) {
      videos++;
      const id = `vid_${String(videos).padStart(4, "0")}`;
      const destName = `${id}${ext}`;
      const dest = path.join(OUT_VID, destName);
      fs.copyFileSync(file, dest);
      const caption = defaultCaption(rel, "video");
      const capFile = path.join(OUT_CAP, `${id}.txt`);
      fs.writeFileSync(capFile, caption, "utf8");
      entries.push({
        id,
        type: "video",
        source: rel,
        output: path.relative(OUT, dest),
        captionFile: path.relative(OUT, capFile),
        caption,
      });
      continue;
    }

    skipped++;
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    trigger: TRIGGER,
    counts: { images, videos, skipped, total: entries.length },
    note: "Images are ready for LoRA. Videos are indexed; extract frames with ffmpeg for more training stills.",
    entries,
  };

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log("Lilly dataset prepared");
  console.log(JSON.stringify(manifest.counts, null, 2));
  console.log(`Output: ${OUT}`);
  if (images < 20) {
    console.log(
      `Warning: only ${images} images. Aim for 30–100 for a strong LoRA.`
    );
  }
  if (images === 0 && videos === 0) {
    console.log(`Drop files into ${RAW} then re-run.`);
    process.exitCode = 1;
  }
}

main();

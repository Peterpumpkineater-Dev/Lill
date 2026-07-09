# Lilly training media (you own this content)

Drop **your** exports here. Do **not** scrape OnlyFans.

## Layout

```
data/
  lilly-raw/          ← put original images + videos here (any nesting ok)
  lilly-dataset/      ← created by prepare script (normalized for LoRA)
  lilly-dataset/
    images/           ← copies/resized stills
    videos/           ← video clips kept separate (LoRA uses frames/stills)
    captions/         ← .txt captions next to images
    manifest.json     ← index of all files
```

## Supported formats

- Images: `.jpg` `.jpeg` `.png` `.webp`
- Videos: `.mp4` `.mov` `.webm` (indexed; extract keyframes later for LoRA)

## Trigger token

Captions should include: **`lillyissilly`**

## Next

```powershell
cd C:\Lilly-OS
npm run dataset:prepare
```

See `docs/LORA_TRAINING.md` and `docs/SETUP_CHECKLIST.md`.

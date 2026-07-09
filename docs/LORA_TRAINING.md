# Train Lilly’s look (LoRA) on RTX 5060

OLMo is **not** used for images. Use an **image LoRA** (SDXL/Flux).

## 1. Export your photos

Put images you own (exports from phone/OF, not scraped) here:

```
C:\Lilly-OS\data\lilly-raw\
```

Aim for **30–100** clear photos (face + body variety, good lighting).

## 2. Trigger token

Use: `lillyissilly` (matches `LORA_TRIGGER` env).

## 3. Train (example with Kohya / sd-scripts)

Install a LoRA trainer of your choice (Kohya_ss GUI is common on Windows).

Suggested starting point (SDXL LoRA):

- Resolution: 1024
- Network rank: 16–32
- Learning rate: ~1e-4
- Steps: 1000–2000 (watch for overfit)
- Caption: include `lillyissilly` in each caption

Rough time on **RTX 5060**: **2–8 hours**.

## 4. Deploy weights

**Option A — Fal (cloud gens for Railway)**

1. Upload LoRA to Fal or HuggingFace
2. Railway vars:
   ```
   MEDIA_ENABLED=true
   MEDIA_PROVIDER=fal
   FAL_KEY=your_fal_key
   FAL_IMAGE_MODEL=fal-ai/flux/dev
   LORA_TRIGGER=lillyissilly
   LORA_PATH_OR_URL=https://...your-lora.safetensors
   ```

**Option B — Local ComfyUI on 5060**

Run ComfyUI with your LoRA; later point a local adapter at it (PC must stay on).

## 5. Test via API

```bash
curl -X POST https://YOUR-APP.up.railway.app/api/media/image \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"teasing mirror selfie\"}"

curl -X POST https://YOUR-APP.up.railway.app/api/chat \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"send me a cute pic\",\"wantImage\":true}"
```

## 6. Budget

`DAILY_IMAGE_BUDGET=50` (default) caps cloud spend while she runs herself.

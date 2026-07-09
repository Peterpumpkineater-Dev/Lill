# Train Lilly’s look (LoRA) on RTX 5060 → serve from cloud

**Architecture:** train on your **5060 only when fine-tuning**.  
**Day-to-day gens:** cloud (Fal + your LoRA). Your GPU can sleep.

Full story: **[TRAIN_LOCAL_SERVE_CLOUD.md](./TRAIN_LOCAL_SERVE_CLOUD.md)**

OLMo is **not** used for images. Use an **image LoRA** (SDXL/Flux).

---

## 1. Dataset

```powershell
cd C:\Lilly-OS
# Drop owned media in Pics\ or data\lilly-raw\
npm run dataset:prepare
```

Training folder:

```text
C:\Lilly-OS\data\lilly-dataset\images
```

Each image should have a matching `.txt` caption including trigger:

```text
lillyissilly
```

Aim for **30–100** clear stills (face + body variety).

Check readiness:

```powershell
npm run dataset:status
```

---

## 2. Train on the 5060 (GPU session)

Install a LoRA trainer (e.g. **Kohya_ss** GUI on Windows).

### Starter settings (SDXL LoRA, ~8GB)

| Setting | Value |
|---------|--------|
| Base model | SDXL 1.0 (or Flux if VRAM allows) |
| Resolution | 1024 (try 768 if OOM) |
| Network rank (dim) | 16–32 |
| Learning rate | ~1e-4 |
| Steps | 1000–2000 |
| Batch | 1 + gradient accumulation |
| Caption | must include `lillyissilly` |

**Time:** ~2–8 hours on a 5060.

**Output:** e.g. `lillyissilly-lora.safetensors`

When training finishes → **you can turn the GPU off** until the next fine-tune.

---

## 3. Upload LoRA for cloud inference

1. Account: [fal.ai](https://fal.ai)  
2. Upload the `.safetensors` (Fal assets / custom LoRA — follow current Fal UI/docs)  
3. Copy the **path or public URL** of the file  

(Alternatively: Hugging Face file URL if Fal accepts it.)

---

## 4. Railway (cloud gens — no home GPU)

Lilly service **Variables**:

```text
MEDIA_ENABLED=true
MEDIA_PROVIDER=fal
FAL_KEY=your_fal_key
FAL_IMAGE_MODEL=fal-ai/flux/dev
LORA_TRIGGER=lillyissilly
LORA_PATH_OR_URL=<your uploaded lora path or url>
LORA_SCALE=1
```

Redeploy. Then:

- https://YOUR-APP.up.railway.app/chat → **Send + pic**  
- Or `POST /api/media/image` / `POST /api/chat` with `wantImage: true`

Cloud (Fal) GPUs do the work. **Your 5060 stays off.**

---

## 5. When to use the 5060 again

Only to **improve recognition / likeness**:

1. Add better photos/videos → `npm run dataset:prepare`  
2. Retrain LoRA a few hours  
3. Re-upload → update `LORA_PATH_OR_URL` on Railway  

---

## 6. Budget

`DAILY_IMAGE_BUDGET=50` (default) caps cloud spend.

---

## 7. Test commands

```bash
curl -X POST https://YOUR-APP.up.railway.app/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\":\"send me a cute teaser\",\"wantImage\":true}"
```

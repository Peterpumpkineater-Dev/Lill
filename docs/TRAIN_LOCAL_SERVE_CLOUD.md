# Train on 5060 → generate from the cloud (PC GPU off)

## Your model

| When | Where | What |
|------|--------|------|
| **Fine-tune only** | RTX 5060 (home) | Image LoRA (her face/body) + optional text |
| **Every day** | Cloud (Railway + Fal/API) | Chat + generate pics that look like her |
| **Your 5060** | Sleep / other games | Not needed for fans chatting |

**“Recognition” for future pics** = an **image LoRA** trained on your photos so the cloud model keeps her identity.  
It is **not** OLMo and not “CPU diffusion” on Railway (too slow). Cloud **image APIs** (e.g. Fal) run on **their** GPUs; you pay per image, your PC stays off.

```text
[5060 - rare]  train LoRA  →  upload weights
                                    ↓
[Cloud - always]  Railway Lilly  →  Fal (+ your LoRA)  →  pics of her
                  Railway Lilly  →  LLM API            →  chat
```

---

## Phase 1 — Image LoRA on the 5060 (one-time / occasional)

### 1. Dataset (already started)

```powershell
cd C:\Lilly-OS
# Pics live in Pics\ or data\lilly-raw\
npm run dataset:prepare
```

Use folder:

```text
C:\Lilly-OS\data\lilly-dataset\images
```

Trigger word: **`lillyissilly`**

Aim for 30–100 solid stills (you already have ~67 including video frames).

### 2. Train LoRA (Kohya / sd-scripts / GUI)

Rough SDXL LoRA settings for 8GB class GPUs:

| Setting | Starter value |
|---------|----------------|
| Base | SDXL 1.0 or Flux-dev (if VRAM allows) |
| Resolution | 1024 (or 768 if OOM) |
| Network rank | 16–32 |
| LR | ~1e-4 |
| Steps | 1000–2000 |
| Caption | each `.txt` includes `lillyissilly` |

Time: about **2–8 hours** on a 5060.

Output: `lillyissilly.safetensors` (or similar).

### 3. Upload for cloud inference (Fal)

1. Create account at [fal.ai](https://fal.ai)  
2. Upload LoRA (Fal assets / storage / model page — follow current Fal “custom LoRA” docs)  
3. Copy public path or file URL  

### 4. Railway variables (inference — no home GPU)

```text
MEDIA_ENABLED=true
MEDIA_PROVIDER=fal
FAL_KEY=your_fal_key
FAL_IMAGE_MODEL=fal-ai/flux/dev
LORA_TRIGGER=lillyissilly
LORA_PATH_OR_URL=https://...or fal path to your lora...
```

Redeploy. Chat **Send + pic** → cloud gen with her look. **5060 can be off.**

### 5. When to use the 5060 again

Only when you want a **better** likeness:

- New photos/videos → `npm run dataset:prepare`  
- Retrain LoRA a few hours  
- Re-upload → update `LORA_PATH_OR_URL`  

---

## Phase 2 — Text chat (cloud, no home GPU)

Persona is already wired on `/chat`.

### Free / open for testing on 5060 only

- Install [Ollama](https://ollama.com)  
- `ollama pull dolphin-llama3` (or similar)  
- Test: `http://localhost:11434/v1`  

### Cloud after (PC off)

Pick one:

| Option | Notes |
|--------|--------|
| **Hosted API** (OpenRouter, etc.) | Easiest; choose a model that allows adult content |
| **Small GPU pod** (RunPod/Vast) running Ollama/vLLM | Your fine-tuned GGUF; pay only while pod is on |
| **No fine-tune** | Good system prompt + uncensored hosted model |

Railway:

```text
LLM_ENABLED=true
LLM_API_URL=https://.../v1
LLM_API_KEY=...
LLM_MODEL=...
```

Optional later: fine-tune text on 5060 from:

```text
GET /api/training/export
```

Export chats → QLoRA → GGUF → host in cloud. Same rule: **train local, serve remote.**

---

## Phase 3 — Day-to-day ops

| Action | Where |
|--------|--------|
| Fans / trainers chat | `https://lilly-….up.railway.app/chat` |
| Generate pics | Cloud Fal + your LoRA |
| Smart replies | Cloud LLM API |
| Fine-tune look or voice | Turn on 5060, train, upload, update env |

---

## What you do not need

- Home GPU running 24/7  
- `redis://localhost` on Railway  
- Training OLMo for images (wrong tool)  
- Pure CPU image generation on Railway (impractical)

---

## Checklist

- [ ] Dataset prepared (`data/lilly-dataset/images`)  
- [ ] LoRA trained on 5060  
- [ ] LoRA uploaded to Fal (or host)  
- [ ] Railway `MEDIA_*` + `FAL_KEY` + `LORA_PATH_OR_URL`  
- [ ] Railway `LLM_*` for cloud chat  
- [ ] Test `/chat` → text + **Send + pic**  
- [ ] Power off 5060; confirm gens still work  

---

## Related docs

- `docs/LORA_TRAINING.md` — dataset details  
- `docs/PERSONA_CHAT.md` — chat persona  
- `docs/RAILWAY.md` — Postgres/Redis  

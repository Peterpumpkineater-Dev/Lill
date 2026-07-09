# Lilly setup checklist (in order)

Do these in sequence. You can collect images in parallel (step 4 folder).

## 1. Railway — databases (required for full brain)

On the Railway **project canvas** (left of the Lilly box):

1. **+ Create** → **Database** → **PostgreSQL**
2. **+ Create** → **Database** → **Redis**
3. Open **Lilly** → **Variables** → add:

| Variable | How |
|----------|-----|
| `DATABASE_URL` | **Variable Reference** → Postgres → `DATABASE_URL` |
| `REDIS_URL` | **Variable Reference** → Redis → `REDIS_URL` (or private URL) |
| `NODE_ENV` | `production` |
| `API_KEY` | `lilly_4xrDfd0XltWntEJ4VPk2xm818YlKoJXee14yoDxy2w8` |
| `PRIMARY_TRAFFIC_URL` | `https://onlyfans.com/lillyissilly` |
| `AUTONOMY_ENABLED` | `true` |
| `AUTONOMY_LEVEL` | `full` |
| `AUTONOMY_GENERATE_MEDIA` | `true` |
| `DAILY_IMAGE_BUDGET` | `50` |
| `PUBLISH_AUTO_APPROVED` | `true` |
| `PUBLISH_REQUIRE_COMPLIANCE` | `true` |

4. Redeploy (or wait for auto).

### Check

```text
https://YOUR-APP.up.railway.app/health
```

Expect: `"status":"ok"` with `"db":true,"redis":true`.

If `"status":"setup"`, DB/Redis still not linked.

---

## 2. Self-run confirm

```bash
curl https://YOUR-APP.up.railway.app/health
curl -H "x-api-key: YOUR_KEY" https://YOUR-APP.up.railway.app/api/autonomy
curl -X POST -H "x-api-key: YOUR_KEY" -H "Content-Type: application/json" ^
  https://YOUR-APP.up.railway.app/api/autonomy/tick
```

---

## 3. Smart chat (LLM)

Add Railway variables:

```
LLM_ENABLED=true
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=sk-your-key
LLM_MODEL=gpt-4o-mini
```

(Or OpenRouter / Grok OpenAI-compatible URL.)

Redeploy, then:

```bash
curl -X POST https://YOUR-APP.up.railway.app/api/chat ^
  -H "x-api-key: YOUR_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"hey babe, how was your day?\"}"
```

Without LLM she still replies with heuristics.

---

## 4. Images for training (you are doing this)

1. Export photos/videos you **own** into:

```
C:\Lilly-OS\data\lilly-raw\
```

2. Run:

```powershell
cd C:\Lilly-OS
npm run dataset:prepare
```

3. Train LoRA on RTX 5060 — see `docs/LORA_TRAINING.md`

4. For **live** gens on Railway, add:

```
MEDIA_ENABLED=true
MEDIA_PROVIDER=fal
FAL_KEY=your_fal_key
FAL_IMAGE_MODEL=fal-ai/flux/dev
LORA_TRIGGER=lillyissilly
LORA_PATH_OR_URL=https://...your-lora.safetensors
```

Until Fal/LoRA is set, media uses **stub** placeholders so the loop still runs.

---

## 5. Talk to Lilly (2 trainers — web UI)

1. Set `CHAT_PASSWORD` on Railway (default: `lilly-train-2026` — change it)
2. Open: `https://YOUR-APP.up.railway.app/chat`
3. Each person uses their **name** + password
4. All chats are saved for training export

```bash
curl -H "x-api-key: YOUR_KEY" https://YOUR-APP.up.railway.app/api/training/export -o lilly-chat-train.jsonl
```

See `docs/TRAINING_CHAT.md`.

API:

```bash
curl -X POST https://YOUR-APP.up.railway.app/api/chat ^
  -H "x-api-key: YOUR_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"send me a cute teaser pic\",\"wantImage\":true}"
```

Fan channel (drafts until `FAN_AUTO_REPLY=true`):

```bash
curl -X POST https://YOUR-APP.up.railway.app/api/fan/chat ^
  -H "x-api-key: YOUR_KEY" ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"hi\",\"userId\":\"fan1\"}"
```

---

## Parallel track

While you fill `data/lilly-raw\`, finish **step 1 (Postgres + Redis)** so autonomy can run text/publish loop without waiting on LoRA.

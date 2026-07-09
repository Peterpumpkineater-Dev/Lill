# Railway deployment — Postgres + Redis

Lilly OS needs **PostgreSQL** and **Redis** in the **same Railway project** as the Lilly service.

## Critical: never use localhost on Railway

| Wrong (local .env) | Right (Railway) |
|--------------------|-----------------|
| `redis://localhost:6379` | Redis service reference URL |
| `postgresql://…@localhost:5432/…` | Postgres service reference URL |

`localhost` inside the Lilly container means **Lilly itself**, not your laptop and not the Redis plugin.

---

## 1. Create services (canvas)

1. Open your Railway project  
2. **+ Create** → **Database** → **PostgreSQL**  
3. **+ Create** → **Database** → **Redis**  
4. Wait until both are healthy  

You should see three boxes: **Lilly**, **Postgres**, **Redis**.

---

## 2. Wire variables into Lilly

### Option A — Variable Reference (UI, recommended)

1. Click **Lilly** → **Variables**  
2. Delete any `REDIS_URL` set to `redis://localhost:6379`  
3. **New Variable** → name `DATABASE_URL`  
   - Use **Add variable reference**  
   - Service: **Postgres** (name may vary)  
   - Variable: **`DATABASE_URL`**  
4. **New Variable** → name `REDIS_URL`  
   - Reference → **Redis** → **`REDIS_URL`** (or `REDIS_PRIVATE_URL`)  

### Option B — Railway reference syntax

If your project supports raw references in shared variables / config:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

**Note:** The service names must match **exactly** what Railway shows (e.g. `Postgres`, `PostgreSQL`, `Redis`).  
If the reference fails, use Option A (UI picker).

### Also set on Lilly

```text
HOST=0.0.0.0
PORT=3000
NODE_ENV=production
API_KEY=<long secret>
CHAT_PASSWORD=<shared training password>
PRIMARY_TRAFFIC_URL=https://onlyfans.com/lillyissilly
```

Networking public port must match **`PORT`** (use **3000**).

---

## 3. Deploy & verify

1. Redeploy Lilly  
2. Deploy logs should include something like:
   - `Lilly canary listening` / `listenPort`
   - `infra env OK` or clear `MISSING DATABASE_URL` / localhost errors  
   - `migrations ok` + `redis connected` when URLs are correct  
3. Open:

```text
https://YOUR-SERVICE.up.railway.app/health
```

### Healthy response (full mode)

```json
{
  "status": "ok",
  "server": { "ok": true },
  "postgres": { "ok": true, "configured": true },
  "redis": { "ok": true, "configured": true }
}
```

### Setup / misconfigured

```json
{
  "status": "setup",
  "env": {
    "missing": ["REDIS_URL"],
    "errors": ["REDIS_URL is redis://localhost:…"],
    "hints": ["…Add Reference → Redis…"]
  },
  "postgres": { "ok": false, "configured": true, "error": "…" },
  "redis": { "ok": false, "configured": true, "error": "…" }
}
```

Chat UI: `https://YOUR-SERVICE.up.railway.app/chat`

---

## 4. Dockerfile / start

Repo entrypoint:

```text
node server.cjs
```

- Binds HTTP immediately on `PORT`  
- Loads full app from `dist/app.js` when the image includes a full build  

Use **`Dockerfile.full`** content as `Dockerfile` for production builds with TypeScript, or keep the minimal canary Dockerfile until networking works.

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `REDIS_URL is localhost` | Reference Redis service, delete localhost |
| `migration failed` | Fix `DATABASE_URL` + SSL (Railway needs real Postgres URL) |
| 502 Bad Gateway | `HOST=0.0.0.0`, `PORT` = Networking port (3000) |
| `/health` setup forever | Both URLs must be set and reachable |

---

## 6. Local alternative

See **Local Docker Compose** section in `docs/LOCAL_INFRA.md` (or below).

```bash
docker compose up -d postgres redis
# .env:
# DATABASE_URL=postgresql://lilly:lilly_secret@localhost:5432/lilly_os
# REDIS_URL=redis://localhost:6379
npm run dev
```

Local **may** use localhost. Railway **must not**.

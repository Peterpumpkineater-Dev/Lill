# Local infrastructure (Docker Compose)

Use this on your PC only. **Do not** copy these localhost URLs into Railway.

## Start Postgres + Redis

```bash
cd C:\Lilly-OS
docker compose up -d postgres redis
```

Services:

| Service | URL |
|---------|-----|
| PostgreSQL | `postgresql://lilly:lilly_secret@localhost:5432/lilly_os` |
| Redis | `redis://localhost:6379` |

## `.env` (local)

```env
NODE_ENV=development
HOST=0.0.0.0
PORT=3100
DATABASE_URL=postgresql://lilly:lilly_secret@localhost:5432/lilly_os
REDIS_URL=redis://localhost:6379
API_KEY=dev-lilly-api-key-change-me
CHAT_PASSWORD=lilly-train-2026
PRIMARY_TRAFFIC_URL=https://onlyfans.com/lillyissilly
```

## Run Lilly

```bash
npm install
npm run db:migrate
npm run dev
```

Or canary:

```bash
npm run build
node server.cjs
```

## Health check

```bash
curl http://localhost:3100/health
```

Expect `postgres.ok: true` and `redis.ok: true` when Compose is up.

## Chat

```text
http://localhost:3100/chat
```

## Full stack via Compose

```bash
docker compose up -d --build
```

(Requires a production Dockerfile that builds the app; see `Dockerfile.full`.)

## Stop

```bash
docker compose down
```

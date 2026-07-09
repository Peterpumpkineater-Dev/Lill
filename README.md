# Lilly OS

Business assistant for content creators. Manages content planning, compliance review, scheduling, analytics, and audience engagement drafts — with human-in-the-loop controls — plus a simple web chat assistant.

## Principles

- **No impersonation** of real people
- **No deceptive automation** of DMs, fake profiles, or fake social proof
- **Compliance-first**: content is reviewed before publish when required
- **Human approval** for community replies and high-risk actions

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 20+, TypeScript |
| API | Express REST + WebSocket |
| DB | PostgreSQL (optional in dev) |
| Queue | Redis + BullMQ (optional in dev) |
| Logging | Pino |
| Tests | Vitest |
| Deploy | Docker / Railway |

## Quick start (local — no database needed)

```bash
npm install
npm run dev
```

Then open:

- **Chat UI:** http://localhost:3100/chat
- **Health:** http://localhost:3100/health

Without `DATABASE_URL` / `REDIS_URL` the server boots in **setup mode**: the chat
box and `/health` work, agent APIs return 503 with setup hints. Nothing crashes.

### Chat API

```bash
curl -X POST http://localhost:3100/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
# -> {"reply":"..."}
```

With no model provider configured, Lilly answers with a simple built-in persona.
To connect an OpenAI-compatible provider (OpenAI, OpenRouter, Ollama, vLLM…):

```env
LLM_ENABLED=true
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

### Full mode (agents, missions, training chat)

Requires Postgres + Redis:

```bash
cp .env.example .env       # set DATABASE_URL + REDIS_URL
docker compose up -d       # local Postgres + Redis (optional)
npm run db:migrate
npm run dev
```

## Scripts

| Command | What it does |
|---------|--------------|
| `npm install` | install dependencies |
| `npm run dev` | dev server with reload (tsx watch) |
| `npm run build` | compile TypeScript to `dist/` |
| `npm start` | production entry (`server.cjs`, serves `dist/`) |
| `npm test` | run vitest suite |
| `npm run lint` | typecheck only |

## Railway (production)

Deploys via the included `Dockerfile` (see `railway.toml`). Docs: [docs/RAILWAY.md](docs/RAILWAY.md) · [docs/SETUP_CHECKLIST.md](docs/SETUP_CHECKLIST.md)

Required service variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
HOST=0.0.0.0
PORT=3000                # must match Railway Networking target port
```

Optional:

```text
LLM_ENABLED=true         # + LLM_API_URL / LLM_API_KEY / LLM_MODEL for real AI replies
API_KEY=<random secret>  # protects the full agent API under /api
CORS_ORIGINS=*
```

**Never** set `REDIS_URL=redis://localhost:6379` on Railway — use the Variable Reference.

Checklist after deploy:

1. Create **Postgres** + **Redis** services in the same Railway project
2. Reference their URLs into the Lilly service (values above)
3. `GET /health` → `postgres.ok: true` + `redis.ok: true`
4. Open `/chat` and send a message

The server listens **before** connecting to the database, so `/health` and `/chat`
respond even while infra is missing — `/health` reports exactly what is missing.

## Endpoints

| Route | Auth | Notes |
|-------|------|-------|
| `GET /health` | none | server / postgres / redis / env status, never crashes |
| `GET /chat` | none | web chat UI |
| `POST /api/chat` | none (rate-limited) | `{ message }` → `{ reply }`, works without DB/Redis |
| `GET /api/chat/status` | none | LLM + mode status |
| `POST /api/public/chat/message` | chat password | persona training chat (full mode only) |
| `/api/*` | `x-api-key` | agent APIs (full mode only) |

## License

Private / UNLICENSED

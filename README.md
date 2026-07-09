# Lilly OS

Autonomous business assistant for adult content creators. Manages content planning, compliance review, scheduling, multi-platform publishing (where allowed), analytics, and audience engagement drafts — with human-in-the-loop controls.

## Principles

- **No impersonation** of real people
- **No deceptive automation** of DMs or fake social proof
- **Compliance-first**: content is reviewed before publish when required
- **Human approval** for community replies and high-risk actions
- **Traffic growth** via continuous, policy-compliant posts on allowed adult platforms

## Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 20+, TypeScript |
| API | Express REST + WebSocket |
| DB | PostgreSQL |
| Queue | Redis + BullMQ |
| Logging | Pino |
| Tests | Vitest |
| Deploy | Docker Compose |

## Agents

1. **Mission Director** — goals → tasks  
2. **Content Planner** — calendars, captions, media org  
3. **Community Assistant** — draft replies only (never auto-posts)  
4. **Analytics Agent** — KPIs, reports, experiments  
5. **Memory Manager** — brand voice, campaigns, preferences  
6. **Compliance Agent** — policy flags, pre-publish review  
7. **Scheduler** — queues, reminders, workflows  
8. **Publisher** — posts to allowed adult platforms for traffic  
9. **Dashboard API** — KPIs, tasks, health  

## Quick start (local)

```bash
cp .env.example .env
npm install
# Start Postgres + Redis (Docker optional)
docker compose up -d
npm run db:migrate
npm run dev
```

## Railway (production)

**Ordered setup:** **[docs/SETUP_CHECKLIST.md](docs/SETUP_CHECKLIST.md)**  
Also: [docs/RAILWAY.md](docs/RAILWAY.md) · [docs/SELF_RUN.md](docs/SELF_RUN.md) · [docs/LORA_TRAINING.md](docs/LORA_TRAINING.md)

1. Deploy from GitHub `Peterpumpkineater-Dev/Lill`  
2. Add **Postgres** + **Redis**, link `DATABASE_URL` / `REDIS_URL`  
3. Set `API_KEY`, `PRIMARY_TRAFFIC_URL`, `AUTONOMY_ENABLED=true`, `AUTONOMY_LEVEL=full`  
4. Health: `GET /health` → `"status":"ok"`  
5. Chat: `POST /api/chat` · Media: `POST /api/media/image`

### Training media (your PC)

```powershell
# Drop images/videos into data\lilly-raw\
npm run dataset:prepare
```

## Phases

See `docs/ARCHITECTURE.md` for design decisions and module map.

## License

Private / UNLICENSED

# Deployment

## Docker Compose

```bash
cp .env.example .env
# edit API_KEY, PRIMARY_TRAFFIC_URL, brand settings
docker compose up -d --build
docker compose exec api node dist/db/migrate.js
# or: npm run db:migrate against compose Postgres
```

## Local (no Docker for app)

```bash
# Postgres + Redis running locally
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

## Production checklist

- [ ] Strong `API_KEY`
- [ ] TLS terminator in front of Express
- [ ] Managed Postgres + Redis
- [ ] `PUBLISH_AUTO_APPROVED=false` until workflows are trusted
- [ ] `PUBLISH_REQUIRE_COMPLIANCE=true`
- [ ] Real platform credentials only for ToS-allowed automation
- [ ] Log shipping (pino JSON → aggregator)
- [ ] Backups for Postgres

## Continuous traffic posting

1. Create mission: `POST /api/missions` with goal including "traffic" / "publish"
2. Content Planner fills calendar with traffic CTAs
3. Compliance reviews each item
4. Human approves: `POST /api/content/:id/approve` (or enable auto-approve)
5. Scheduler queues multi-platform jobs
6. Publisher posts via adapters on interval

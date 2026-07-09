# Railway deployment

## Target

- Repo: https://github.com/Peterpumpkineater-Dev/Lilly  
- Public URL: https://lilly-production-f314.up.railway.app  

## One-time setup

1. Railway → New Project → **Deploy from GitHub** → `Peterpumpkineater-Dev/Lilly`
2. Add plugins:
   - **PostgreSQL**
   - **Redis**
3. Service variables (Variables tab):

| Variable | Value |
|----------|--------|
| `NODE_ENV` | `production` |
| `API_KEY` | strong random secret |
| `PRIMARY_TRAFFIC_URL` | your OnlyFans/Fansly link |
| `CREATOR_HANDLE` | brand handle |
| `BRAND_VOICE` | tone string |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` or private URL |
| `AUTONOMY_ENABLED` | `true` |
| `AUTONOMY_LEVEL` | `semi` |
| `AUTONOMY_INTERVAL_MINUTES` | `60` |
| `PUBLISH_AUTO_APPROVED` | `true` (semi/full autonomy) |
| `PUBLISH_REQUIRE_COMPLIANCE` | `true` |
| `WEBHOOK_SECRET` | strong secret |
| `CORS_ORIGINS` | `*` or your dashboard origin |
| `LLM_ENABLED` | `false` until you add a key |
| `LLM_API_URL` | e.g. `https://api.openai.com/v1` |
| `LLM_API_KEY` | provider key |
| `LLM_MODEL` | e.g. `gpt-4o-mini` |

4. Settings:
   - Builder: Dockerfile  
   - Healthcheck path: `/health`  
   - Generate domain if needed  

5. Deploy → wait for build → open `/health`

## Smoke tests

```bash
curl https://lilly-production-f314.up.railway.app/health

curl -H "x-api-key: YOUR_KEY" \
  https://lilly-production-f314.up.railway.app/api/dashboard

curl -X POST -H "x-webhook-secret: YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Traffic push\",\"goal\":\"Grow traffic with continuous posts\"}" \
  https://lilly-production-f314.up.railway.app/api/webhooks/mission
```

## Upgrade path (usage limits)

1. Raise Railway plan / resources  
2. Add dedicated LLM API or host fine-tuned model  
3. Enable real platform adapters with credentials  

## Notes

- Migrations run on every start (`node dist/db/migrate.js && node dist/index.js`)
- Without `LLM_*`, agents use deterministic heuristics
- With autonomy on, Lilly refills content calendar and queues publish jobs automatically

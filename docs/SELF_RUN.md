# Lilly self-run

Lilly operates autonomously when Railway has **Postgres + Redis** and autonomy is on.

## Capabilities

| Feature | Endpoint / behavior |
|---------|---------------------|
| Autonomy loop | Auto mission → content → media → compliance → publish |
| Chat as Lilly | `POST /api/chat` |
| Fan chat (gated) | `POST /api/fan/chat` (`FAN_AUTO_REPLY=false` → drafts only) |
| Generate image | `POST /api/media/image` |
| Force tick | `POST /api/autonomy/tick` |

## Required Railway variables

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
API_KEY=lilly_4xrDfd0XltWntEJ4VPk2xm818YlKoJXee14yoDxy2w8
PRIMARY_TRAFFIC_URL=https://onlyfans.com/lillyissilly
AUTONOMY_ENABLED=true
AUTONOMY_LEVEL=full
AUTONOMY_GENERATE_MEDIA=true
DAILY_IMAGE_BUDGET=50
PUBLISH_AUTO_APPROVED=true
PUBLISH_REQUIRE_COMPLIANCE=true
```

## Optional (smarter + real images)

```
LLM_ENABLED=true
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

MEDIA_ENABLED=true
MEDIA_PROVIDER=fal
FAL_KEY=...
LORA_TRIGGER=lillyissilly
LORA_PATH_OR_URL=...
```

Without media keys, image gen uses a **stub placeholder** so the loop still runs.

## Fan safety

- `FAN_AUTO_REPLY=false` (default): fan messages return **drafts** only  
- `FAN_IMAGE_PER_USER_DAY=3` when auto-reply + images enabled  

## Kill switch

```
AUTONOMY_ENABLED=false
```

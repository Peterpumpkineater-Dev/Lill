# Creator persona + NSFW chat

## What changed

Public `/chat` now uses the **creator persona** (not business assistant):

- First-person flirty Lilly
- Adult/NSFW talk allowed when asked
- **Send + pic** button → media pipeline
- Illegal content involving minors still blocked

## Railway variables for real AI + images

```text
# Smart talk (use an adult-capable OpenAI-compatible API)
LLM_ENABLED=true
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini

# Or OpenRouter / Grok / other — pick a model that allows adult content

# Images
MEDIA_ENABLED=true
MEDIA_PROVIDER=fal
FAL_KEY=your_fal_key
FAL_IMAGE_MODEL=fal-ai/flux/dev
LORA_TRIGGER=lillyissilly
LORA_PATH_OR_URL=

PERSONA_BIO=Lilly is an adult creator, flirty and confident...
BRAND_VOICE=playful, confident, warm, flirty
PRIMARY_TRAFFIC_URL=https://onlyfans.com/lillyissilly
```

Without LLM keys she still uses **creator heuristics** (not business bot).  
Without Fal she may use **stub placeholders** when you ask for a pic.

## Test

1. Open `https://YOUR-APP.up.railway.app/chat`
2. Say hi → flirty creator voice  
3. Ask for a pic or tap **Send + pic**  
4. Check status line: `llm: on/off · media: on/off`

## API

```bash
curl -X POST https://YOUR-APP/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hey baby","wantImage":false}'
```

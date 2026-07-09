# Training chat (2 people)

## Purpose

Let **two people** talk to Lilly in the browser. Every message is **saved** for later fine-tuning.

## URL

```
https://YOUR-APP.up.railway.app/chat
```

## Password

Railway variable:

```
CHAT_ENABLED=true
CHAT_PASSWORD=lilly-train-2026
```

Change `CHAT_PASSWORD` and share it only with the two trainers (not the full `API_KEY`).

## How to use

1. Open `/chat` on phone or PC  
2. Enter **name** (e.g. Alex / Sam) + **password**  
3. Chat normally  
4. Optional: **Send + ask for pic**  

Each person gets their own session (`train:name`).

## Requirements

- Postgres + Redis linked (`/health` → `ok`)  
- Optional: `LLM_ENABLED=true` + key for smarter replies  
- Optional: `MEDIA_ENABLED` + Fal for real images  

## Export training data

```bash
curl -H "x-api-key: YOUR_API_KEY" ^
  https://YOUR-APP.up.railway.app/api/training/export ^
  -o lilly-chat-train.jsonl
```

Also:

- `GET /api/training/stats`  
- `GET /api/training/chats?limit=100`  

## Tips for better training data

- Natural multi-turn chats  
- Correct her if she sounds wrong  
- Mix flirty, business, and casual  
- Use both trainers so style isn’t one-person only  

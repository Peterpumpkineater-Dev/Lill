# Lilly’s look (identity)

## Rule

Lilly’s appearance is learned **only** from your photos/videos in:

```text
C:\Lilly-OS\Pics
C:\Lilly-OS\data\lilly-raw
→ prepared as → data\lilly-dataset\images
```

Trigger token: **`lillyissilly`**

- She generates **herself only** (solo, same face/body).  
- **No friends / other people** until you train and register separate identities later.  
- When someone asks for a picture (including **tasteful full nudity**), prompts stay playful and identity-locked to her.

## Pipeline

1. Drop media in `Pics\`  
2. `npm run dataset:prepare` && `npm run dataset:status`  
3. Train LoRA on 5060 (see `docs/LORA_TRAINING.md`)  
4. Upload LoRA → set Railway:

```text
MEDIA_ENABLED=true
MEDIA_PROVIDER=fal
FAL_KEY=...
LORA_TRIGGER=lillyissilly
LORA_PATH_OR_URL=...
```

5. Cloud gens use her look; **GPU only for the next fine-tune**

## Friends (later)

When you want other people in gens:

1. Separate photo sets per person  
2. Separate LoRA + trigger each  
3. Code will need multi-subject routing (not enabled yet)

Until then, chat will say she only knows **her** look.

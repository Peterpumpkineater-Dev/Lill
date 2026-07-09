"""
Train Lilly character LoRA on RTX 5060 (~8GB) using Diffusers + PEFT.

Usage:
  C:\\Lilly-OS\\lilly-train-venv\\Scripts\\python.exe C:\\Lilly-OS\\scripts\\train_lilly_lora.py

Output:
  C:\\Lilly-OS\\data\\lilly-lora\\lillyissilly-lora.safetensors
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import torch
import torch.nn.functional as F
from accelerate import Accelerator
from accelerate.utils import ProjectConfiguration, set_seed
from diffusers import AutoencoderKL, DDPMScheduler, UNet2DConditionModel
from diffusers.optimization import get_scheduler
from diffusers.training_utils import cast_training_params
from peft import LoraConfig
from peft.utils import get_peft_model_state_dict
from safetensors.torch import save_file
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from tqdm.auto import tqdm
from transformers import CLIPTextModel, CLIPTokenizer

DEFAULT_DATA = Path(r"C:\Lilly-OS\data\lilly-dataset\images")
DEFAULT_OUT = Path(r"C:\Lilly-OS\data\lilly-lora")
DEFAULT_MODEL = "runwayml/stable-diffusion-v1-5"
TRIGGER = os.environ.get("LORA_TRIGGER", "lillyissilly")


class LillyDataset(Dataset):
    def __init__(self, folder: Path, size: int = 512, trigger: str = TRIGGER):
        self.folder = folder
        self.trigger = trigger
        exts = {".jpg", ".jpeg", ".png", ".webp"}
        self.files = sorted(p for p in folder.iterdir() if p.suffix.lower() in exts)
        if not self.files:
            raise SystemExit(f"No images in {folder}")
        self.tf = transforms.Compose(
            [
                transforms.Resize(size, interpolation=transforms.InterpolationMode.BILINEAR),
                transforms.CenterCrop(size),
                transforms.RandomHorizontalFlip(p=0.5),
                transforms.ToTensor(),
                transforms.Normalize([0.5], [0.5]),
            ]
        )

    def __len__(self) -> int:
        return len(self.files)

    def _caption(self, img_path: Path) -> str:
        txt = img_path.with_suffix(".txt")
        if txt.exists():
            cap = txt.read_text(encoding="utf-8", errors="ignore").strip()
            if self.trigger not in cap:
                cap = f"{self.trigger}, {cap}"
            return cap
        return f"{self.trigger}, solo, one woman only, adult woman content creator, photo"

    def __getitem__(self, idx: int):
        path = self.files[idx]
        img = Image.open(path).convert("RGB")
        return {"pixel_values": self.tf(img), "caption": self._caption(path)}


def collate(examples):
    return {
        "pixel_values": torch.stack([e["pixel_values"] for e in examples]).float(),
        "captions": [e["caption"] for e in examples],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--model", type=str, default=DEFAULT_MODEL)
    parser.add_argument("--resolution", type=int, default=512)
    parser.add_argument("--train_steps", type=int, default=800)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--batch_size", type=int, default=1)
    parser.add_argument("--grad_accum", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--save_every", type=int, default=200)
    args = parser.parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU required")

    set_seed(args.seed)
    args.output.mkdir(parents=True, exist_ok=True)

    accelerator = Accelerator(
        gradient_accumulation_steps=args.grad_accum,
        mixed_precision="fp16",
        project_config=ProjectConfiguration(project_dir=str(args.output)),
    )

    n_img = len([*args.data.glob("*.jpg"), *args.data.glob("*.png"), *args.data.glob("*.jpeg"), *args.data.glob("*.webp")])
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Data: {args.data} ({n_img} images)")
    print(f"Steps: {args.train_steps} | rank={args.rank} | res={args.resolution} | trigger={TRIGGER}")

    tokenizer = CLIPTokenizer.from_pretrained(args.model, subfolder="tokenizer")
    text_encoder = CLIPTextModel.from_pretrained(args.model, subfolder="text_encoder")
    vae = AutoencoderKL.from_pretrained(args.model, subfolder="vae")
    unet = UNet2DConditionModel.from_pretrained(args.model, subfolder="unet")
    noise_scheduler = DDPMScheduler.from_pretrained(args.model, subfolder="scheduler")

    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)
    unet.requires_grad_(False)

    unet_lora_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.rank,
        init_lora_weights="gaussian",
        target_modules=["to_k", "to_q", "to_v", "to_out.0"],
    )
    unet.add_adapter(unet_lora_config)
    cast_training_params(unet, dtype=torch.float32)

    lora_params = list(filter(lambda p: p.requires_grad, unet.parameters()))
    optimizer = torch.optim.AdamW(lora_params, lr=args.lr)

    dataset = LillyDataset(args.data, size=args.resolution)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True, collate_fn=collate, num_workers=0)

    unet, optimizer, loader = accelerator.prepare(unet, optimizer, loader)
    text_encoder.to(accelerator.device, dtype=torch.float16)
    vae.to(accelerator.device, dtype=torch.float16)

    lr_scheduler = get_scheduler(
        "constant",
        optimizer=optimizer,
        num_warmup_steps=0,
        num_training_steps=args.train_steps * args.grad_accum,
    )

    global_step = 0
    progress = tqdm(total=args.train_steps, desc="Lilly LoRA")
    unet.train()

    while global_step < args.train_steps:
        for batch in loader:
            with accelerator.accumulate(unet):
                pixels = batch["pixel_values"].to(dtype=torch.float16)
                with torch.no_grad():
                    latents = vae.encode(pixels).latent_dist.sample() * vae.config.scaling_factor

                noise = torch.randn_like(latents)
                bsz = latents.shape[0]
                timesteps = torch.randint(
                    0, noise_scheduler.config.num_train_timesteps, (bsz,), device=latents.device
                ).long()
                noisy = noise_scheduler.add_noise(latents, noise, timesteps)

                tokens = tokenizer(
                    batch["captions"],
                    max_length=tokenizer.model_max_length,
                    padding="max_length",
                    truncation=True,
                    return_tensors="pt",
                ).input_ids.to(accelerator.device)

                with torch.no_grad():
                    encoder_hidden = text_encoder(tokens)[0]

                model_pred = unet(noisy, timesteps, encoder_hidden, return_dict=False)[0]
                loss = F.mse_loss(model_pred.float(), noise.float(), reduction="mean")

                accelerator.backward(loss)
                if accelerator.sync_gradients:
                    accelerator.clip_grad_norm_(lora_params, 1.0)
                optimizer.step()
                lr_scheduler.step()
                optimizer.zero_grad()

            if accelerator.sync_gradients:
                global_step += 1
                progress.update(1)
                progress.set_postfix(loss=float(loss.detach().float().cpu()))

                if accelerator.is_main_process and (
                    global_step % args.save_every == 0 or global_step >= args.train_steps
                ):
                    unwrapped = accelerator.unwrap_model(unet)
                    lora_state = get_peft_model_state_dict(unwrapped)
                    save_dir = args.output / f"checkpoint-{global_step}"
                    save_dir.mkdir(parents=True, exist_ok=True)
                    out_file = save_dir / "pytorch_lora_weights.safetensors"
                    save_file(lora_state, str(out_file))
                    print(f"\nSaved {out_file}")

            if global_step >= args.train_steps:
                break

    progress.close()

    if accelerator.is_main_process:
        unwrapped = accelerator.unwrap_model(unet)
        lora_state = get_peft_model_state_dict(unwrapped)
        final_dir = args.output / "final"
        final_dir.mkdir(parents=True, exist_ok=True)
        final_file = final_dir / "pytorch_lora_weights.safetensors"
        save_file(lora_state, str(final_file))
        dest = args.output / "lillyissilly-lora.safetensors"
        import shutil

        shutil.copy2(final_file, dest)
        print(f"\n=== Training complete ===\nLoRA file: {dest}")
        print(f"Size: {dest.stat().st_size / 1024 / 1024:.1f} MB")
        print("Next: upload to Fal → Railway MEDIA_ENABLED + FAL_KEY + LORA_PATH_OR_URL")


if __name__ == "__main__":
    main()

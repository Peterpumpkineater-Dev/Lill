@echo off
cd /d C:\Lilly-OS
set PYTHONUNBUFFERED=1
echo Starting Lilly LoRA training at %DATE% %TIME% > data\lilly-lora-train.log
"C:\Lilly-OS\lilly-train-venv\Scripts\python.exe" "C:\Lilly-OS\scripts\train_lilly_lora.py" --data "C:\Lilly-OS\data\lilly-dataset\images" --output "C:\Lilly-OS\data\lilly-lora" --train_steps 400 --resolution 512 --rank 16 --grad_accum 1 --save_every 100 >> data\lilly-lora-train.log 2>> data\lilly-lora-train.err
echo EXIT_CODE=%ERRORLEVEL% >> data\lilly-lora-train.log
echo Done at %DATE% %TIME% >> data\lilly-lora-train.log

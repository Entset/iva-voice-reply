#!/usr/bin/env python3
"""Silero TTS v5 local engine: stdin -> ogg/opus on stdout.

Args: --speaker ru_XXX [--rate 48000]
Input: plain text on stdin (must be UTF-8). Output: ogg/opus wav-wrapped bytes on stdout.
Errors -> stderr, nonzero exit.
"""
import argparse
import os
import warnings
warnings.simplefilter("ignore")
import subprocess
import sys

try:
    from torch import package as tp
except Exception as e:
    print(f"tts_py import error: {e}", file=sys.stderr)
    sys.exit(3)

MODEL_PATH = os.environ.get("SILERO_MODEL", "/home/lnsrtw/tts/v5_cis_base.pt")
VENV = "/home/lnsrtw/tts/venv"

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--speaker", default="ru_zinaida")
    ap.add_argument("--rate", type=int, default=48000)
    args = ap.parse_args()
    text = sys.stdin.read()
    if not text.strip():
        print("tts_py: empty input", file=sys.stderr)
        return 2
    try:
        from silero_stress import accentor as st_acc
    except Exception as e:
        print(f"tts_py accentor import error: {e}", file=sys.stderr)
        return 3
    try:
        imp = tp.PackageImporter(MODEL_PATH)
        model = imp.load_pickle("tts_models", "model")
    except Exception as e:
        print(f"tts_py model load error: {e}", file=sys.stderr)
        return 4
    try:
        import torch
    except Exception as e:
        print(f"tts_py torch import error: {e}", file=sys.stderr)
        return 3
    try:
        acc = st_acc.load_accentor('ru')
        accented = acc(text)
        audio = model.apply_tts(text=accented, speaker=args.speaker, sample_rate=args.rate)
    except Exception as e:
        msg = str(e)
        if "not in available speakers" in msg or "speaker" in msg.lower() and "available" in msg.lower():
            sp = sorted(model.speakers)
            ru = [s for s in sp if s.startswith("ru_")]
            print(f"tts_py unknown speaker: {args.speaker}; ru speakers: {', '.join(ru)}", file=sys.stderr)
            return 5
        print(f"tts_py synth error: {msg[:400]}", file=sys.stderr)
        return 6
    audio16 = (audio * 32767.0).clamp_(-32768.0, 32767.0).to(torch.int16)
    buf = audio16.numpy().tobytes()
    ff = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "s16le", "-ar", str(args.rate), "-ac", "1", "-i", "pipe:0",
         "-c:a", "libopus", "-b:a", "48k", "-ar", str(args.rate), "-ac", "1", "-f", "ogg", "pipe:1"],
        input=buf, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if ff.returncode != 0:
        print(f"tts_py ffmpeg error: {ff.stderr.decode(errors='replace')[:400]}", file=sys.stderr)
        return 7
    sys.stdout.buffer.write(ff.stdout)
    return 0

if __name__ == "__main__":
    sys.exit(main())

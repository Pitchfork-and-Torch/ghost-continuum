#!/usr/bin/env python3
"""Install primary Ghost Continuum logo from a generated source image."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VARIANTS = ASSETS / "logo-variants"


def install(src: Path) -> None:
    if not src.is_file():
        raise SystemExit(f"missing source: {src}")

    VARIANTS.mkdir(parents=True, exist_ok=True)

    # Backup previous primary once
    legacy_png = ASSETS / "ghost-continuum-logo.png"
    if legacy_png.is_file() and not (VARIANTS / "ghost-continuum-logo-v1-legacy.png").is_file():
        legacy_png.replace(VARIANTS / "ghost-continuum-logo-v1-legacy.png")
    legacy_jpg = ASSETS / "ghost-continuum-logo.jpg"
    if legacy_jpg.is_file() and not (VARIANTS / "ghost-continuum-logo-v1-legacy.jpg").is_file():
        legacy_jpg.replace(VARIANTS / "ghost-continuum-logo-v1-legacy.jpg")

    img = Image.open(src).convert("RGBA")
    print(f"source size {img.size} mode {img.mode}")

    w, h = img.size
    side = max(w, h, 1024)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 255))
    scale = min(side / w, side / h) * 0.92
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    ox, oy = (side - nw) // 2, (side - nh) // 2
    canvas.paste(resized, (ox, oy), resized)

    png_path = ASSETS / "ghost-continuum-logo.png"
    jpg_path = ASSETS / "ghost-continuum-logo.jpg"
    rgb = canvas.convert("RGB")
    canvas.save(png_path, "PNG", optimize=True)
    rgb.save(jpg_path, "JPEG", quality=95, optimize=True)
    print(f"wrote {png_path} ({png_path.stat().st_size} bytes) {canvas.size}")
    print(f"wrote {jpg_path} ({jpg_path.stat().st_size} bytes)")

    for s in (512, 256, 128):
        out = ASSETS / f"ghost-continuum-logo-{s}.png"
        canvas.resize((s, s), Image.Resampling.LANCZOS).save(out, "PNG", optimize=True)
        print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: install-logo.py <source-image>")
    install(Path(sys.argv[1]))

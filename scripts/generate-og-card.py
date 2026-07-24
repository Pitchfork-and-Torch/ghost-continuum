#!/usr/bin/env python3
"""Generate 1200x630 Open Graph / Twitter share card for Ghost Continuum."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1200, 630
LOGO = ROOT / "assets" / "ghost-continuum-logo.png"
OUT_PNG = ROOT / "landing" / "og-card.png"
OUT_JPG = ROOT / "landing" / "og-card.jpg"
OUT_SHARE_PNG = ROOT / "landing" / "share-card.png"
OUT_SHARE_JPG = ROOT / "landing" / "share-card.jpg"
OUT_ASSETS = ROOT / "assets" / "og-card.png"


def load_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\consolab.ttf" if bold else r"C:\Windows\Fonts\consola.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGBA", (W, H), (2, 6, 15, 255))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    for i, a in enumerate(range(90, 0, -8)):
        r = 280 + i * 18
        od.ellipse([120 - r, 200 - r, 120 + r, 200 + r], fill=(0, 229, 255, max(1, a // 9)))
    for i, a in enumerate(range(80, 0, -8)):
        r = 260 + i * 16
        od.ellipse([980 - r, 420 - r, 980 + r, 420 + r], fill=(224, 64, 251, max(1, a // 10)))
    for i, a in enumerate(range(60, 0, -8)):
        r = 200 + i * 14
        od.ellipse([600 - r, 300 - r, 600 + r, 300 + r], fill=(124, 77, 255, max(1, a // 12)))

    img = Image.alpha_composite(img, overlay)

    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 40):
        gd.line([(x, 0), (x, H)], fill=(0, 229, 255, 12), width=1)
    for y in range(0, H, 40):
        gd.line([(0, y), (W, y)], fill=(0, 229, 255, 12), width=1)
    img = Image.alpha_composite(img, grid)

    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle([0, 0, W, 4], fill=(0, 229, 255, 200))
    draw.rectangle([0, H - 4, W, H], fill=(224, 64, 251, 160))

    f_mono = load_font(22)
    f_title = load_font(54, bold=True)
    f_sub = load_font(28)
    f_small = load_font(20)
    f_tag = load_font(18)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([70, 180, 330, 460], fill=(0, 229, 255, 40))
    img = Image.alpha_composite(img, glow)

    logo = Image.open(LOGO).convert("RGBA").resize((280, 280), Image.Resampling.LANCZOS)
    img.paste(logo, (70, 170), logo)
    draw = ImageDraw.Draw(img, "RGBA")

    tx, ty = 380, 150
    draw.text((tx, ty), "GHOST CONTINUUM", font=f_mono, fill=(0, 229, 255, 255))
    draw.text((tx, ty + 48), "v3.0  OMEGA ASCENDANT", font=f_tag, fill=(179, 136, 255, 255))
    draw.text((tx, ty + 100), "Living Digital", font=f_title, fill=(232, 244, 255, 255))
    draw.text((tx, ty + 160), "Immune System", font=f_title, fill=(232, 244, 255, 255))
    draw.text((tx, ty + 240), "Evolve  ·  Morph  ·  Contain  ·  Seal", font=f_sub, fill=(138, 166, 196, 255))
    draw.text(
        (tx, ty + 290),
        "Defensive only  ·  Local-first  ·  Zero core deps",
        font=f_small,
        fill=(105, 240, 174, 255),
    )

    chips = ["Command Nexus", "NSGA-II Genome", "Home Shield", "Merkle Forensics"]
    cx, cy = tx, 520
    for chip in chips:
        bbox = draw.textbbox((0, 0), chip, font=f_tag)
        tw = bbox[2] - bbox[0] + 32
        th = 36
        draw.rounded_rectangle(
            [cx, cy, cx + tw, cy + th],
            radius=18,
            outline=(0, 229, 255, 200),
            fill=(6, 18, 36, 230),
        )
        draw.text((cx + 16, cy + 7), chip, font=f_tag, fill=(200, 245, 255, 255))
        cx += tw + 12

    draw.text((W - 360, 40), "ghost.jonbailey.xyz", font=f_mono, fill=(0, 229, 255, 200))
    draw.text((W - 360, 70), "open source  ·  MIT", font=f_tag, fill=(138, 166, 196, 200))
    draw.rounded_rectangle([24, 24, W - 24, H - 24], radius=20, outline=(0, 229, 255, 55), width=2)

    final = img.convert("RGB")
    OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT_PNG, "PNG", optimize=True)
    final.save(OUT_JPG, "JPEG", quality=92, optimize=True)
    final.save(OUT_SHARE_PNG, "PNG", optimize=True)
    final.save(OUT_SHARE_JPG, "JPEG", quality=92, optimize=True)
    final.save(OUT_ASSETS, "PNG", optimize=True)
    print(f"wrote {OUT_PNG} ({OUT_PNG.stat().st_size} bytes) {final.size}")
    print(f"wrote {OUT_JPG} ({OUT_JPG.stat().st_size} bytes)")
    print(f"wrote {OUT_SHARE_PNG} ({OUT_SHARE_PNG.stat().st_size} bytes)")
    print(f"wrote {OUT_SHARE_JPG} ({OUT_SHARE_JPG.stat().st_size} bytes)")


if __name__ == "__main__":
    main()

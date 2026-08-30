#!/usr/bin/env python3
"""Generate 1200x630 Open Graph / Twitter share card - Crystal Nexus brand."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W, H = 1200, 630
LOGO = ROOT / "assets" / "ghost-continuum-logo.png"
OUT_PNG = ROOT / "landing" / "og-card.png"
OUT_JPG = ROOT / "landing" / "og-card.jpg"
OUT_SHARE_PNG = ROOT / "landing" / "share-card.png"
OUT_SHARE_JPG = ROOT / "landing" / "share-card.jpg"
OUT_V3_PNG = ROOT / "landing" / "og-card-v3.png"
OUT_V3_JPG = ROOT / "landing" / "og-card-v3.jpg"
OUT_ASSETS = ROOT / "assets" / "og-card.png"
OUT_ASSETS_V3 = ROOT / "assets" / "og-card-v3.png"

CANVAS = (11, 16, 24, 255)
TEAL = (94, 200, 192)
TEAL_DEEP = (58, 158, 150)
AURORA = (142, 184, 200)
PEARL = (232, 238, 244)
MUTED = (139, 154, 171)
SUCCESS = (107, 196, 160)
FONT_KIT = Path(os.environ.get("USERPROFILE", "")) / "design-assets" / "fontshare"


def load_font(size: int, *, display: bool = False, bold: bool = False) -> ImageFont.ImageFont:
    candidates: list[Path] = []
    if display:
        candidates.extend(
            [
                FONT_KIT / "clash-display" / "otf" / "ClashDisplay-Bold.otf",
                FONT_KIT / "clash-display" / "otf" / "ClashDisplay-Semibold.otf",
                ROOT / "landing" / "fonts" / "fontshare" / "clash-display" / "otf" / "ClashDisplay-Bold.otf",
            ]
        )
    if bold:
        candidates.extend(
            [
                FONT_KIT / "satoshi" / "otf" / "Satoshi-Bold.otf",
                ROOT / "landing" / "fonts" / "fontshare" / "satoshi" / "otf" / "Satoshi-Bold.otf",
                Path(r"C:\Windows\Fonts\segoeuib.ttf"),
            ]
        )
    else:
        candidates.extend(
            [
                FONT_KIT / "satoshi" / "otf" / "Satoshi-Medium.otf",
                FONT_KIT / "satoshi" / "otf" / "Satoshi-Regular.otf",
                ROOT / "landing" / "fonts" / "fontshare" / "satoshi" / "otf" / "Satoshi-Medium.otf",
                Path(r"C:\Windows\Fonts\segoeui.ttf"),
            ]
        )
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def soft_orb(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple[int, int, int], peak: int) -> None:
    for i, a in enumerate(range(peak, 0, -6)):
        rr = r + i * 14
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(*color, max(1, a // 8)))


def main() -> None:
    img = Image.new("RGBA", (W, H), CANVAS)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    soft_orb(od, 180, 220, 220, TEAL, 72)
    soft_orb(od, 980, 400, 240, AURORA, 56)
    soft_orb(od, 620, 280, 180, TEAL_DEEP, 40)

    img = Image.alpha_composite(img, overlay)

    vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    for i in range(40):
        a = int(i * 1.8)
        vd.rectangle([i, i, W - 1 - i, H - 1 - i], outline=(0, 0, 0, a))
    img = Image.alpha_composite(img, vignette)

    draw = ImageDraw.Draw(img, "RGBA")
    draw.rectangle([0, 0, W, 3], fill=(*TEAL, 180))
    draw.rectangle([0, H - 3, W, H], fill=(*AURORA, 120))

    f_kicker = load_font(20, bold=True)
    f_title = load_font(52, display=True, bold=True)
    f_sub = load_font(26)
    f_small = load_font(18)
    f_tag = load_font(16, bold=True)
    f_url = load_font(18)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([60, 160, 360, 470], fill=(*TEAL, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    img = Image.alpha_composite(img, glow)

    if LOGO.exists():
        logo = Image.open(LOGO).convert("RGBA").resize((260, 260), Image.Resampling.LANCZOS)
        img.paste(logo, (80, 175), logo)

    draw = ImageDraw.Draw(img, "RGBA")
    tx, ty = 390, 145
    draw.text((tx, ty), "GHOST CONTINUUM", font=f_kicker, fill=(*TEAL, 255))
    draw.text((tx, ty + 42), "Crystal Membrane  ·  v3.5.0", font=f_tag, fill=(*AURORA, 255))
    draw.text((tx, ty + 92), "The immune system", font=f_title, fill=(*PEARL, 255))
    draw.text((tx, ty + 152), "that watches back.", font=f_title, fill=(*PEARL, 255))
    draw.text((tx, ty + 230), "Detect  ·  Morph  ·  Contain  ·  Seal", font=f_sub, fill=(*MUTED, 255))
    draw.text(
        (tx, ty + 278),
        "Defensive only  ·  Local-first  ·  Zero core deps",
        font=f_small,
        fill=(*SUCCESS, 255),
    )

    chips = ["Command Nexus", "Ghost LAN tab", "Hover map", "Home Shield"]
    cx, cy = tx, 520
    for chip in chips:
        bbox = draw.textbbox((0, 0), chip, font=f_tag)
        tw = bbox[2] - bbox[0] + 28
        th = 34
        draw.rounded_rectangle(
            [cx, cy, cx + tw, cy + th],
            radius=17,
            outline=(*TEAL, 160),
            fill=(18, 26, 36, 230),
        )
        draw.text((cx + 14, cy + 7), chip, font=f_tag, fill=(*PEARL, 255))
        cx += tw + 12

    draw.text((56, H - 42), "ghost.jonbailey.xyz", font=f_url, fill=(*MUTED, 220))

    rgb = img.convert("RGB")
    for out in (OUT_PNG, OUT_SHARE_PNG, OUT_V3_PNG, OUT_ASSETS, OUT_ASSETS_V3):
        out.parent.mkdir(parents=True, exist_ok=True)
        rgb.save(out, "PNG", optimize=True)
    for out in (OUT_JPG, OUT_SHARE_JPG, OUT_V3_JPG):
        rgb.save(out, "JPEG", quality=90, optimize=True)
        print(f"wrote {out} ({out.stat().st_size} bytes)", rgb.size)


if __name__ == "__main__":
    main()

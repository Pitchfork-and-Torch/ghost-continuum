#!/usr/bin/env python3
"""Scrub mojibake + em/en dashes from Ghost public site surfaces.

Standing rule: never use U+2014 em dashes (they re-corrupt to â€”).
Writes UTF-8 without BOM. Keeps middot (U+00B7) as real UTF-8.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

ROOTS = [
    ROOT / "landing",
    ROOT / "deploy" / "jonbailey" / "hub-preview",
    ROOT / "deploy" / "jonbailey" / "site-seo",
    ROOT / "deploy" / "jonbailey" / "site-public",
]

SKIP_DIRS = {".git", "node_modules", "dist", "build", "__pycache__", ".wrangler", "cache"}
EXTS = {
    ".html",
    ".js",
    ".css",
    ".txt",
    ".svg",
    ".md",
    ".json",
    ".xml",
    ".toml",
    ".mjs",
    ".cjs",
}

# Mojibake leftovers -> ASCII-safe (UTF-8 bytes misread as CP1252/latin-1)
MOJ_MAP = {
    "â€”": " - ",  # em dash mojibake
    "â€“": " - ",  # en dash mojibake
    "â€™": "'",
    "â€˜": "'",
    "â€œ": '"',
    "â€\x9d": '"',
    "Â·": " · ",
    "Ã—": "x",
    "â†’": "->",
    "â†\x90": "<-",  # left arrow mojibake (E2 86 90)
    "â†\u0090": "<-",
    "\u00e2\u2020\u0090": "<-",  # â† + C1 control
    "â€¦": "...",
}


def scrub(text: str) -> str:
    for bad, good in MOJ_MAP.items():
        text = text.replace(bad, good)

    # Placeholder alone between quotes/tags: em/en dash as empty value
    text = re.sub(r"(?<=[>\"'=])\s*[\u2014\u2013]\s*(?=[<\"'])", "-", text)
    text = text.replace("\u2014", " - ")  # em dash
    text = text.replace("\u2013", " - ")  # en dash
    # Arrows also re-corrupt to â€¦-style mojibake under CP1252 round-trips
    text = text.replace("\u2192", "->")
    text = text.replace("\u2190", "<-")
    text = text.replace("\u2191", "^")
    text = text.replace("\u2193", "v")

    # Only tidy spacing around the ASCII dash we just inserted (never whole-file indent)
    text = re.sub(r"[ \t]+-[ \t]+", " - ", text)
    text = re.sub(r" -  +", " - ", text)
    return text


def main() -> int:
    roots = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else ROOTS
    changed: list[str] = []

    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.suffix.lower() not in EXTS:
                continue

            raw = path.read_bytes()
            had_bom = raw.startswith(b"\xef\xbb\xbf")
            if had_bom:
                raw = raw[3:]
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("utf-8", errors="replace")

            new = scrub(text)
            if new != text or had_bom:
                path.write_text(new, encoding="utf-8", newline="\n")
                changed.append(str(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path))

    print(f"changed={len(changed)}")
    for c in changed:
        print(f"  {c}")

    print("\n=== VERIFY ===")
    bad = 0
    for root in roots:
        if not root.exists():
            continue
        moj = em = 0
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in EXTS:
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            t = path.read_text(encoding="utf-8")
            if any(x in t for x in ("â€", "Â·", "Ã—", "â€™", "â€œ")):
                moj += 1
                bad += 1
                print(f"MOJ still: {path}")
            if "\u2014" in t or "\u2013" in t:
                em += 1
                bad += 1
                print(f"EM still: {path}")
        label = root.name
        print(f"{label}: mojibake_files={moj} em_en_dash_files={em}")

    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())

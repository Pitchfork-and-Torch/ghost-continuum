#!/usr/bin/env python3
"""Fail if mojibake or forbidden em/en dashes appear in public site surfaces.

Exit 0 = clean. Exit 1 = problems found.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_ROOTS = [
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

# Classic CP1252 mis-decodes of UTF-8
MOJIBAKE_MARKERS = (
    "â€”",
    "â€“",
    "â€™",
    "â€˜",
    "â€œ",
    "â€\x9d",
    "Â·",
    "Ã—",
    "â†’",
    "â€¦",
    "â”‚",
    "â”€",
    "â”Œ",
)

FORBIDDEN = (
    "\u2014",  # em dash - becomes â€” when mis-encoded
    "\u2013",  # en dash
    "\u2192",  # right arrow - becomes â†’ when mis-encoded
    "\u2190",
)


def main() -> int:
    roots = [Path(p) for p in sys.argv[1:]] if len(sys.argv) > 1 else DEFAULT_ROOTS
    issues: list[str] = []

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
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError) as exc:
                issues.append(f"{path}: read error: {exc}")
                continue

            for marker in MOJIBAKE_MARKERS:
                if marker in text:
                    issues.append(f"{path}: mojibake marker {marker!r}")
                    break
            else:
                for ch in FORBIDDEN:
                    if ch in text:
                        issues.append(
                            f"{path}: forbidden dash U+{ord(ch):04X} "
                            f"(use ASCII '-' / ' - ' instead)"
                        )
                        break

    if issues:
        print(f"UTF-8 hygiene FAILED ({len(issues)} issue(s)):")
        for line in issues[:50]:
            print(f"  {line}")
        if len(issues) > 50:
            print(f"  ... and {len(issues) - 50} more")
        print("\nFix: py -u scripts/scrub_public_utf8.py")
        print("Also: py -u $env:USERPROFILE\\.grok\\tools\\fix_mojibake_utf8.py <path>")
        return 1

    print("UTF-8 hygiene OK (no mojibake, no em/en dashes in public surfaces)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

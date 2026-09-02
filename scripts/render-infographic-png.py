"""Render landing/infographic.svg to PNG via Playwright."""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SVG = ROOT / "landing" / "infographic.svg"
OUT_DOCS = ROOT / "docs" / "screenshots" / "infographic-luminous-membrane.png"
OUT_ASSETS = ROOT / "assets" / "infographic-luminous-membrane.png"
OUT_DESK = Path.home() / "Desktop" / "Ghost-infographic-v3.3.7-Crystal-Nexus.png"
TMP = ROOT / "docs" / "screenshots" / "_infographic_render.html"


def main() -> None:
    OUT_DOCS.parent.mkdir(parents=True, exist_ok=True)
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>html,body{{margin:0;background:#0b1018;}}img{{display:block;width:1200px;height:auto;}}</style>
</head><body>
<img src="{SVG.as_uri()}" width="1200" height="720" alt="infographic"/>
</body></html>"""
    TMP.write_text(html, encoding="utf-8")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1200, "height": 720}, device_scale_factor=2)
        page.goto(TMP.as_uri(), wait_until="networkidle")
        page.wait_for_timeout(500)
        page.locator("img").screenshot(path=str(OUT_DOCS))
        browser.close()
    data = OUT_DOCS.read_bytes()
    OUT_ASSETS.write_bytes(data)
    OUT_DESK.write_bytes(data)
    TMP.unlink(missing_ok=True)
    print(f"wrote {OUT_DOCS} ({OUT_DOCS.stat().st_size} bytes)")
    print(f"wrote {OUT_DESK}")


if __name__ == "__main__":
    main()

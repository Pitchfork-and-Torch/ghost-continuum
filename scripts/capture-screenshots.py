"""Capture Ghost Continuum screenshots for GitHub README."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"
REPO = ROOT

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright", "-q"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.sync_api import sync_playwright


def snap(page, path, url, *, setup=None, scroll=0, wait=2500):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(wait)
    if setup:
        setup(page)
    if scroll:
        page.evaluate(f"window.scrollTo(0, {scroll})")
        page.wait_for_timeout(600)
    page.screenshot(path=str(path), full_page=False)
    print(f"  {path.name}")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    shots = [
        ("command-nexus.png", "http://127.0.0.1:30000/", None, 0),
        ("intrusion-map.png", "http://127.0.0.1:30000/", None, 0),
        ("product-landing.png", (REPO / "landing" / "index.html").as_uri(), None, 0),
        ("product-site.png", "https://ghost.jonbailey.xyz/", None, 0),
        ("hub-online.png", "https://ghost.jonbailey.xyz/hub/", None, 0),
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080, "device_scale_factor": 1})

        snap(page, OUT / "command-nexus.png", "http://127.0.0.1:30000/", wait=3500)
        # Focus map panel if present
        page.evaluate("document.getElementById('mapCanvas')?.scrollIntoView({block:'center'})")
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / "intrusion-map.png"), full_page=False)
        print("  intrusion-map.png")

        snap(page, OUT / "product-landing.png", (REPO / "landing" / "index.html").as_uri())
        snap(page, OUT / "product-site.png", "https://ghost.jonbailey.xyz/", wait=3000)
        snap(page, OUT / "hub-online.png", "https://ghost.jonbailey.xyz/hub/", wait=3500)

        browser.close()

    print(f"Done: {OUT}")


if __name__ == "__main__":
    main()
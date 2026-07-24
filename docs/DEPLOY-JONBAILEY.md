# Deploy Ghost Continuum for jonbailey.xyz

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         Cloudflare Edge           │
                    └─────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
  jonbailey.xyz/*                    ghost.jonbailey.xyz
  (Edge Worker)                      ┌──────────┬──────────┐
  tripwire + sentinel inject         │  Pages   │ Worker   │
         │                           │  Hub UI  │ /api/*   │
         ▼                           └────┬─────┴────┬─────┘
  UPSTREAM (Pages .pages.dev)              │          │
  your real site origin                    │          ▼
                                           │    Cloudflare Tunnel
                                           │          │
                                           ▼          ▼
                                    static assets   Node hub :30000
                                    (dashboard)     Ghost LAN, planes,
                                                    ~/.ghost-continuum data
```

**Why hybrid?** The Command Hub needs Node.js (filesystem, Ghost LAN subprocess, plane arm/disarm). Cloudflare Workers/Pages host the **Edge tripwire** and **public UI + API gateway**; the **brain** stays on your machine via Tunnel.

---

## Prerequisites

- Node.js 18+ on the operator machine
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm i -g wrangler`
- Cloudflare account with `jonbailey.xyz` zone
- `wrangler login`

---

## Part A — Edge protection (jonbailey.xyz)

### 1. Create KV namespace

```bash
wrangler kv namespace create DM_KV
```

Copy the `id` into `deploy/jonbailey/edge/wrangler.toml` → `[[kv_namespaces]] id`.

### 2. Set upstream origin

Edit `deploy/jonbailey/edge/wrangler.toml`:

```toml
[vars]
SITE_SEED = "jonbailey.xyz"
UPSTREAM = "jonbailey-xyz.pages.dev"   # your Pages hostname — NOT jonbailey.xyz
```

### 3. Deploy Edge Worker

```powershell
cd ghost-continuum
npm run deploy:edge:jonbailey
```

### 4. Attach routes (Cloudflare Dashboard)

**Workers & Pages → jonbailey-sentinel-edge → Settings → Triggers → Routes:**

| Route | Zone |
|-------|------|
| `jonbailey.xyz/*` | jonbailey.xyz |
| `www.jonbailey.xyz/*` | jonbailey.xyz |

Route order: Worker runs **before** origin. `UPSTREAM` fetches the real site from Pages/origin directly.

### 5. Verify Edge

```bash
curl https://jonbailey.xyz/.__dm/status
curl -X POST https://jonbailey.xyz/.__dm/tripwire -H "Content-Type: application/json" -d "{\"t\":\"probe\"}"
```

### 6. Local hub config

Merge `deploy/jonbailey/config.jonbailey.json` into `~/.ghost-continuum/config.json`:

```json
{
  "primaryDomain": "jonbailey.xyz",
  "useLocalEdge": false,
  "edgeStatusUrl": "https://jonbailey.xyz/.__dm/status",
  "tripwireUrl": "https://jonbailey.xyz/.__dm/tripwire",
  "hubToken": "YOUR_LONG_RANDOM_TOKEN"
}
```

Restart hub: `npm start`

---

## Part B — Command Hub (ghost.jonbailey.xyz)

### 1. Cloudflare Tunnel (local hub)

```powershell
cloudflared tunnel create ghost-continuum-hub
cloudflared tunnel route dns ghost-continuum-hub ghost.jonbailey.xyz
```

Create `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: %USERPROFILE%\.cloudflared\<TUNNEL_ID>.json

ingress:
  - hostname: ghost.jonbailey.xyz
    service: http://127.0.0.1:30000
  - service: http_status:404
```

Run tunnel: `cloudflared tunnel run ghost-continuum-hub`

Set `GC_HUB_TOKEN` (same token as config `hubToken`):

```powershell
$env:GC_HUB_TOKEN = "YOUR_LONG_RANDOM_TOKEN"
npm start
```

### 2. Deploy Hub UI (Cloudflare Pages)

```powershell
npm run deploy:hub:pages
```

**Dashboard:** Workers & Pages → Create project → Connect to `ghost-continuum-hub`  
**Custom domain:** `ghost.jonbailey.xyz`  
**Build output:** `packages/hub-ui/public` (direct upload via Wrangler)

### 3. Deploy API gateway Worker (optional if using Tunnel for all traffic)

If you want `/api` on the same hostname via Worker → Tunnel:

```powershell
npm run deploy:hub:gateway
wrangler secret put HUB_ORIGIN   # https://ghost.jonbailey.xyz (tunnel URL) or internal
wrangler secret put HUB_TOKEN    # same as GC_HUB_TOKEN
```

Route: `ghost.jonbailey.xyz/api/*`

**Simpler path:** Tunnel alone serves UI + API from local hub — skip gateway Worker and point DNS only to tunnel.

### 4. Cloudflare Access (recommended)

**Zero Trust → Access → Applications → Add:**

- **Domain:** `ghost.jonbailey.xyz`
- **Policy:** Allow — Email `you@example.com` or service token
- Place Access in front of tunnel or Pages

### 5. Hub token in browser

After Access login, set API token once in devtools:

```javascript
localStorage.setItem('dm-hub-token', 'YOUR_LONG_RANDOM_TOKEN');
location.reload();
```

---

## DNS summary

| Record | Target |
|--------|--------|
| `jonbailey.xyz` | Proxied → Worker route (Edge) |
| `www` | Proxied → Worker route (Edge) |
| `sentinel` | Proxied → Tunnel or Pages + Worker |

---

## Deploy commands cheat sheet

```powershell
# Public product landing (ghost.jonbailey.xyz) — v3 OMEGA ASCENDANT modular site
npm run deploy:site

# Edge tripwire layer
npm run deploy:edge:jonbailey

# Hub static UI
npm run deploy:hub:pages

# Hub API gateway (optional)
npm run deploy:hub:gateway

# Local stack
npm run setup
npm start
```

### Public landing assets (v3.0)

Source of truth for the product homepage:

| Path | Role |
|------|------|
| `landing/index.html` | Cinematic single-page Command interface |
| `landing/css/ascend.css` | Design system |
| `landing/js/*.js` | Hero holo, planes explorer, nexus demo, install, metrics |
| `landing/projects-panel.js` | Ecosystem switcher |
| `landing/infographic.svg` | Architecture diagram / OG image |
| `landing/llms.txt`, `sitemap.xml`, `robots.txt` | AEO / SEO (preferred at deploy) |
| `deploy/jonbailey/site-seo/_headers` | CSP + cache (includes jsDelivr for optional Three) |

`npm run deploy:site` rebuilds `deploy/jonbailey/site-public/` (HTML, css/, js/, SEO, logo, hub preview, OG cards) and runs `wrangler pages deploy` for project **`ghost-continuum`**.

### After every major upgrade (standing)

```powershell
# Full public ship: Pages + AEO/SEO verify + IndexNow
npm run deploy:site:full
```

This deploys Pages then runs `scripts/post-deploy-seo.ps1` (live HEAD checks, meta/AEO spot-check, IndexNow to Bing/IndexNow API). Keep `llms.txt`, `sitemap.xml`, `robots.txt`, and `og-card.png` (1200×630 PNG — not SVG) in sync with the release version.

---

## Manual steps checklist

- [ ] KV namespace bound in `wrangler.toml`
- [ ] `UPSTREAM` set to your Pages dev hostname
- [ ] Edge Worker deployed + routes on apex/www
- [ ] Tunnel + DNS for `sentinel.<your-domain>`
- [ ] `hubToken` / `GC_HUB_TOKEN` configured
- [ ] Cloudflare Access policy on Command Hub hostname
- [ ] Edge status + tripwire verified

Start stack after reboot:

```powershell
cd ghost-continuum
powershell -ExecutionPolicy Bypass -File deploy\jonbailey\scripts\start-production.ps1
```

Mutating `/api/*` routes require `hubToken` / `GC_HUB_TOKEN` as a second layer after Access login.
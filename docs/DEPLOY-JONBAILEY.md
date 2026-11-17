# Deploy Ghost Continuum (self-host)

Public landing is a static site. The dashboard is served by the local hub behind the gateway, not by a separate Pages project. Do not publish a personal host, tunnel, or KV id.

## Public landing

```powershell
npm run deploy:site
```

That rebuilds the static tree and deploys Cloudflare Pages project `ghost-continuum` (or your own project name). Point a custom domain at it if you want.

Full ship (Pages + live SEO checks):

```powershell
npm run deploy:site:full
```

Landing sources:

| Path | Role |
|------|------|
| `landing/index.html` | Product homepage |
| `landing/css/ascend.css` | Design system |
| `landing/js/*.js` | Hero, planes, nexus demo |
| `landing/llms.txt`, `sitemap.xml`, `robots.txt` | AEO / SEO |

## Optional edge tripwire

1. Create a KV namespace (`wrangler kv namespace create DM_KV`).
2. Copy `packages/edge/wrangler.toml.example` (or `deploy/*/edge/wrangler.toml.example`) to a **local** wrangler file. Put **your** KV id there. Do not commit the id.
3. Set `SITE_SEED` and `UPSTREAM` to **your** origin hostname (the Pages `*.pages.dev` host, not the custom domain, so the Worker does not loop).
4. Deploy the Worker and attach routes on **your** zone.

## Command dashboard

The dashboard is served by the local hub behind the gateway. The hub process serves `packages/hub-ui/public` and `/api`. The gateway worker proxies `/api` and `/taxii2` to that hub. Do not deploy the dashboard as its own Pages project.

```powershell
npm start
```

On a checkout that already has the production config and tunnel token, the same stack is:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/jonbailey/scripts/start-production.ps1
```

`npm run deploy:hub:pages` runs `deploy/jonbailey/scripts/deploy-hub-pages.ps1`. That script deploys static files only when Pages project `ghost-continuum-hub` already exists. If the project is missing, the script stops. It does not create one.

Set `hubToken` / `GC_HUB_TOKEN` as a secret, never in git. Do not commit tunnel ids, home paths, or operator emails.

## Local stack

```powershell
npm run setup
npm start
```

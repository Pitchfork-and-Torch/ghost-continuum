# Deploy Ghost Continuum (self-host)

Public landing is a static site. The optional Command Hub is local Node. Do not publish a personal host, tunnel, or KV id.

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

## Optional local hub

The Command Hub needs Node on a machine you control (filesystem, Ghost LAN). Typical pattern:

- Run `npm start` locally
- Put a tunnel or other private ingress in front if you want a hostname
- Set `hubToken` / `GC_HUB_TOKEN` as a secret, never in git
- Cloudflare Access on that hostname is recommended

Do not commit tunnel ids, home paths, or operator emails.

## Local stack

```powershell
npm run setup
npm start
```

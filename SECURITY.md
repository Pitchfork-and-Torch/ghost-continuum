# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 3.6.x   | Yes       |
| 3.5.x   | Yes       |
| 3.4.x   | Best effort |
| 3.0.x–3.3.x | Best effort |
| 2.0.x   | Best effort |
| 1.0.x   | Best effort |

## Reporting a vulnerability

Report security issues via [GitHub Issues](https://github.com/Pitchfork-and-Torch/ghost-continuum/issues) with the title prefix `Security:`.

Do not disclose sensitive details publicly until a fix is available.

## Scope

Ghost Continuum is a **local defensive command center**. The hub and local edge server bind to `127.0.0.1` only. Ghost LAN honeypots bind to your LAN interfaces — never port-forward them to the internet.

## Built-in guardrails

- Target allowlist validation before probes
- Exploit operator roles blocked at the hub
- Hub API is loopback-only
- Optional hub bearer token compared with constant-time equality when set
- Hub **Host** allowlist (loopback by default) blocks DNS rebinding
- Hub **Origin** allowlist on mutating `/api/*` blocks localhost CSRF
- Incident exports redact local paths from config snapshots
- Ghost LAN beacons disabled by default

## Hub Host / Origin lock

The Command Nexus binds to `127.0.0.1`, but a browser tab on another site can still talk to that port (localhost CSRF), and a DNS-rebinding page can make the browser treat the hub as same-origin (then read `/api/status` or the HTML boot token).

Default allowlist: `127.0.0.1`, `localhost`, `::1`.

- Requests whose `Host` header is not on the list receive `421 host not allowed`.
- Mutating `/api/*` requests whose `Origin` is present and not on the list receive `403 origin not allowed`.
- CLI / curl / Node `http` clients that omit `Origin` still work.

If you front the hub with a Cloudflare Tunnel (or similar) on a public hostname, add that hostname — never a secret — to config:

```json
{
  "hubAllowedHosts": ["ghost.jonbailey.xyz"]
}
```

Or set `GC_HUB_ALLOWED_HOSTS=ghost.jonbailey.xyz` (comma-separated). Pair extra hosts with `hubToken` / `GC_HUB_TOKEN` and Cloudflare Access. `npm run doctor` warns when extra hosts are declared without a token.

## Deployment rules

1. Do not expose honeypot ports (8080, 8443, 5901, rotating 40xxx) to the public internet.
2. Set `primaryDomain` only for domains you own before running production edge drills.
3. Keep `CLOUDFLARE_API_TOKEN`, `hubToken` / `GC_HUB_TOKEN`, and tripwire keys out of git — use environment variables or a local (gitignored) config.

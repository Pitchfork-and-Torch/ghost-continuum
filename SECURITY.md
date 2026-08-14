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
- Incident exports redact local paths from config snapshots
- Ghost LAN beacons disabled by default

## Deployment rules

1. Do not expose honeypot ports (8080, 8443, 5901, rotating 40xxx) to the public internet.
2. Set `primaryDomain` only for domains you own before running production edge drills.
3. Keep `CLOUDFLARE_API_TOKEN`, `hubToken` / `GC_HUB_TOKEN`, and tripwire keys out of git — use environment variables or a local (gitignored) config.

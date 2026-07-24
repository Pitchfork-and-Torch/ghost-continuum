# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 3.0.x   | Yes       |
| 2.0.x   | Yes       |
| 1.0.x   | Best effort |
| 0.3.x   | Best effort |

## Reporting a vulnerability

Report security issues via [GitHub Issues](https://github.com/Pitchfork-and-Torch/ghost-continuum/issues) with the title prefix `Security:`.

Do not disclose sensitive details publicly until a fix is available.

## Scope

Ghost Continuum is a **local defensive command center**. The hub and local edge server bind to `127.0.0.1` only. Ghost LAN honeypots bind to your LAN interfaces — never port-forward them to the internet.

## Built-in guardrails

- Target allowlist validation before probes
- Exploit operator roles blocked at the hub
- Hub API is loopback-only
- Incident exports redact local paths from config snapshots
- Ghost LAN beacons disabled by default

## Deployment rules

1. Do not expose honeypot ports (8080, 8443, 5901, rotating 40xxx) to the public internet.
2. Set `primaryDomain` only for domains you own before running production edge drills.
3. Keep `CLOUDFLARE_API_TOKEN` and tripwire keys out of git — use environment variables.
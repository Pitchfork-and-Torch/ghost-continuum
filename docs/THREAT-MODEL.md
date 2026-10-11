# DM-Sentinel Threat Model (v1.0.0)

## Scope

DM-Sentinel is a **defensive-only** local deception platform. This model covers the bundled continuum stack (Ghost LAN, Edge, Hub, Genome, Trust, Narrative, Planes).

## Assets

| Asset | Sensitivity |
|-------|-------------|
| `~/.ghost-continuum/` config, events, ledger, genomes | High - operational telemetry |
| `~/.ghost-lan/` honeypot state | High |
| Hub API (`127.0.0.1:30000`) | High - control plane |
| Merkle ledger root | Medium - integrity anchor |
| STIX/TAXII exports | Medium - sanitized intel |

## Trust boundaries

```
[Attacker] → [Honeypot ports] → [Ghost LAN] → [Hub loopback only]
[Operator] → [Hub UI / CLI] → [All planes]
[Community plugin] → [Plugin loader] → [Plane registry]  (opt-in paths only)
```

## Threats & mitigations

| Threat | Mitigation |
|--------|------------|
| Hub exposed to LAN/WAN | Binds `127.0.0.1` only by default |
| DNS rebinding against the hub | `Host` allowlist: loopback + optional `hubAllowedHosts` / `GC_HUB_ALLOWED_HOSTS` → `421` |
| Localhost CSRF from a random website | Mutating `/api/*` requires loopback (or declared) `Origin`; missing `Origin` still allowed for CLI |
| Localhost CSRF via mutating GET | `GET /api/threat/watch` is read-only; quiet-hours / notify run on a hub timer (img tags omit `Origin`) |
| Tunneled hub read / token leak | Extra hosts require `hubToken`; all `/api/*` methods check bearer or HttpOnly cookie; HTML never injects the token into JavaScript |
| Unauthorized scope probes | Allowlist + `blockExploitOperators` |
| Attacker escapes honeypot to host | Minimal listeners, no shell escape paths, container mirage isolated to localhost |
| Ledger tampering | Merkle append-only chain + verify on export |
| Malicious community plugin | Explicit path opt-in; plugin contract; no auto-load from network |
| LLM prompt injection via attacker | Narrative opt-in; scripted fallback; honeypot context only |
| eBPF probe privilege abuse | Deep Veil opt-in; placeholder script operator-controlled |
| Mesh leaks PII | Sanitized fitness summaries only - no IPs in gossip payloads |

## Out of scope

- Offensive exploitation tooling
- Remote hub administration without operator action
- Automatic weaponization of captured attacker data

## Packed / evasion-class probes

Ghost LAN is a network deception fabric, not a host EDR. Published multilayer packers (for example BOAZ-class combinators) mostly live on disk and in process. The useful invert for this product is the **HTTP and host-adjacent residue** those pipelines still leave:

| Residue | Ghost response |
|---------|----------------|
| Scanner / lab UAs, header-starved clients | `analyzeRequest` score + bare/stealth morph |
| UUID / MAC / IPv4 list carriers in the URL | `encoded-blob` class, minimal response |
| `.cpl` / `rundll32` / `control.exe` paths | `sideload` class |
| VM / sandbox / Sysmon path recon | trap trip + `anti-emu` class |
| Combined high score | dossier + threat-response `evasion-probe` TTP |

Host-side residue (stolen version resources, entropy padding, ETW stub patches, AmCache wipe, unexpected signed PEs) is **out of Ghost LAN scope**. Track that on the operator host integrity plane, not by adding offensive loaders here.

## Residual risk

- Operator misconfiguration (binding hub to `0.0.0.0`, disabling allowlist)
- Container runtime vulnerabilities when Mirage Core enabled
- Supply chain in optional Tauri/desktop build (separate from zero-dep core)

## Recommendations

1. Keep hub on loopback
2. Do not add public names to `hubAllowedHosts` unless the hub is tunneled there - extra hosts **require** `hubToken` (enforced on `/api/*`)
3. Review `continuum.plugins` paths before enable
4. Run `npm run doctor` after upgrades
5. Export incidents via sealed `.tgz` for forensics chain of custody
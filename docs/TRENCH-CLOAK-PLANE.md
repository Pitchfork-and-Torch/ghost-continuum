# Trench Coat Plane

**Plane ID:** `trench-cloak`  
**Role:** Privacy cloak as an enable/disable sensor plane in Ghost Continuum — monitors Trench Coat, can auto-start it, and exposes the cloak proxy to other continuum tools.

## Why it belongs

Ghost Continuum watches, deceives, and seals. **Trench Coat** is the complementary *invisibility* layer: multi-hop proxy chaining (Tor, SOCKS, self-hosted). Linking them means the Command Nexus can arm or disarm the cloak at will while the immune fabric runs — without mixing offensive tooling into either project.

## Enable / disable at will

| Path | How |
|------|-----|
| **Nexus UI** | SENSOR PLANES → **Trench Coat** switch |
| **API** | `POST /api/continuum/planes/toggle` `{ "planeId": "trench-cloak", "enabled": true }` |
| **CLI** | `ghost-continuum planes on trench-cloak` / `planes off trench-cloak` |
| **Config** | `continuum.planes.trenchCloak: true` |
| **Arm-all** | `npm run arm:planes` (turns trenchCloak on + starts monitor) |

Stack boot (`npm start` / `start-stack.js`) auto-arms the monitor if `trenchCloak` is already true in config.

## What happens when ON

1. Starts a **background monitor** (poll entry + Tor + control API)
2. Optionally **auto-starts** `trench up` if `trenchAutoStart: true` and CLI is installed
3. Writes status to `~/.ghost-continuum/trench-cloak/status.json`
4. Surfaces **OFF / ARMED / CLOAK** in the plane panel
5. Exposes helpers for other tools: proxy URL when healthy

When **OFF**: stops monitor, clears status, stops any **managed** trench process Ghost Continuum started.

## Config

```json
"continuum": {
  "planes": {
    "trenchCloak": false,
    "trenchEntryHost": "127.0.0.1",
    "trenchEntryPort": 1080,
    "trenchApiPort": 8742,
    "trenchAutoStart": false,
    "trenchRouteTools": true,
    "trenchPollMs": 20000
  }
}
```

| Key | Default | Meaning |
|-----|---------|---------|
| `trenchCloak` | `false` | Plane enabled |
| `trenchAutoStart` | `false` | Spawn `trench up --accept-legal` if entry is down |
| `trenchRouteTools` | `true` | Allow other modules to read cloak proxy URL |
| `trenchPollMs` | `20000` | Monitor interval |

Env: `TRENCH_COAT_HOME` or `TRENCH_COAT_BIN` to locate the trench CLI for auto-start.

## Hub API (works with other tools)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/trench/status` | Plane + last probe + binary path |
| `POST /api/trench/refresh` | Re-probe now |
| `GET /api/trench/identity` | Egress IP / IsTor via cloak (`curl --socks5-hostname`) |
| `POST /api/trench/engage` | Force enable + arm monitor |

Other continuum code can import:

```js
import { getCloakProxyUrl, isCloaked, fetchViaCloak } from '../../planes/src/trench-cloak.js';
```

## Operator flow

1. Install [Trench Coat](https://github.com/Pitchfork-and-Torch/trench-coat) (or set `TRENCH_COAT_HOME`)
2. `trench up --accept-legal` **or** set `trenchAutoStart: true`
3. Toggle **Trench Coat** ON in Nexus (or CLI / API)
4. Plane shows **CLOAK** when entry + Tor (or IsTor identity) are healthy
5. Other tools: `GET /api/trench/identity` · proxy `socks5://127.0.0.1:1080`

Landing: https://trenchcoat.jonbailey.xyz/

## Legal

Legal-first privacy only. Same boundaries as [Trench Coat](https://github.com/Pitchfork-and-Torch/trench-coat).  
Ghost Continuum does not force your browser through the cloak; it monitors and optionally starts the local cloak process you control.

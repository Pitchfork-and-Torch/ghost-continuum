# Magic Demo — Living Deception Continuum

> Five minutes to feel the sentinel breathe.

## 1. Awaken the organism

```bash
git clone https://github.com/Pitchfork-and-Torch/ghost-continuum.git
cd ghost-continuum
npm run setup
npm start
```

Watch the terminal: the **Living Deception Continuum** banner appears. Your browser opens the Command Nexus at `http://127.0.0.1:30000`.

You should see:
- **Deception Efficacy Score** (click for breakdown — starts low, it learns)
- **Sentinel morph** (click to switch: Stealth, Research, Aggressive, Forensic)
- **Champion genome** (click for radar visualizer)
- **Ledger root** (tamper-evident chain hash)
- **Holographic Intrusion Map** — every dot is a real event (time × depth, color = plane, shape = TTP)
- **Explain Mode / Lore Mode** — hover any control for contextual education
- **NL query hints** — try `credential dumping`, `trap trips`, `scanner activity`
- **Deception Story Weaver** — local narrative summary of the active campaign
- **Plane toggles** — show/hide layers on the map; extended planes persist to `~/.ghost-continuum/config.json`

## 2. Probe your own honeypot

From another terminal on the same machine:

```bash
curl -s http://127.0.0.1:8080/ | head -5
curl -s -A "Mozilla/5.0" http://127.0.0.1:8080/login
```

Return to the hub. The **tripwire feed** lights up. The **heatmap** gains a bar. Each interaction feeds the **Deception Genome** fitness engine.

## 3. Evolve better traps

Click **Evolve genome pool** in the hub (or):

```bash
curl -X POST http://127.0.0.1:30000/api/genome/evolve -H "Content-Type: application/json" -d "{}"
```

The system runs mutation + crossover. Superior genomes become champions. Ghost LAN hot-swaps morph fragments on the next rotation — **no restart**.

## 4. Trigger a persona rotation

```bash
curl -X POST http://127.0.0.1:30000/api/rotate/lan
```

Probe again. Notice fingerprint shifts: CSS variables, decoy paths, comment scrambling — all from the champion genome.

## 5. Seal an incident

```bash
curl -X POST http://127.0.0.1:30000/api/incident/export \
  -H "Content-Type: application/json" \
  -d '{"label":"magic-demo"}'
```

Download the `.tgz`. It includes events, status snapshot, and **Merkle ledger provenance**.

## 6. Optional — narrative layer

Edit `~/.ghost-continuum/config.json`:

```json
{
  "continuum": {
    "narrative": { "enabled": true, "worldId": "lab-alpha" }
  }
}
```

With [Ollama](https://ollama.com) running locally:

```bash
curl -X POST http://127.0.0.1:30000/api/continuum/narrative \
  -H "Content-Type: application/json" \
  -d '{"ip":"10.0.0.99","prompt":"show last backup status"}'
```

Without Ollama, scripted fallbacks still maintain **Echo Reality** continuity.

## 7. Easter egg — ghost stories

```bash
DM_GHOST_STORIES=1 node bin/ghost-continuum.js doctor
```

---

**What you just witnessed:** polymorphism that **breeds**, memory that **persists**, and audit trails that **cannot lie** — all local-first, defensive-only, zero npm dependencies.
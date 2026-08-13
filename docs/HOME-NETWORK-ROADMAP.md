# Ghost Continuum — home network manager appeal roadmap

Ideas to make the Living Digital Immune System feel essential for every home lab, family network, and small office.

## Already strong / shipped

- Local-first, no cloud tax for core intelligence  
- Zero-deps core engine  
- One-click DEMO for “wow” without real risk  
- LIVE vs DEMO separation  
- Real-threat RESPOND playbook  
- Plane toggles for the seven sensor layers  
- **Home Shield wizard** + router/family/apartment profiles  
- **Home vs Expert language** pack  
- **PWA** (manifest + service worker)  
- **Device trust inventory** + unknown IP suggestions  
- **Quiet hours + kid mode**  
- **Weekly home report** (markdown + JSON on disk)  
- **Backup / restore** of config, home, devices, genomes  
- **Discord / Telegram / generic / Home Assistant** notify hooks  
- **Progress badges** (hygiene-focused)  
- **Trust banner**, high contrast, reduced motion  
- **HA state JSON** at `/api/home/ha-state`  

## Product ideas (prioritized for home operators)

### 1. “Home Shield” first-run wizard (high impact)
- 5 questions: router brand, whether you use Cloudflare, Windows/Mac/Linux hub machine, kids’ devices, cameras/NAS on LAN  
- Auto-picks morph + which planes to arm  
- Generates a one-page “your house is protected” card  

### 2. Family-friendly language mode
- Toggle: **Expert** vs **Home** wording  
- “COMPROMISED-EDGE” → “Someone poked your internet door”  
- Efficacy → “How well your decoys are working”  

### 3. Mobile companion / PWA
- Installable Nexus on phone  
- Push or local notifications: “Scanner hit your fake NAS”  
- Big RESPOND / SEAL buttons for couch ops  

### 4. Router & ISP reality packs
- Presets: UniFi, pfSense, OPNsense, eero, ISP gateway (limited)  
- Copy-paste firewall rules to mirror LAN honeypot subnets  
- “I only have one PC” path that still arms Edge + Audit  

### 5. Device inventory + safe neighbors
- Discover authorized devices (mDNS/SSDP/ARP, user-approved)  
- Label “known good” so map noise drops  
- Alert only on unknown MACs/IPs probing traps  

### 6. Quiet hours & kid mode
- Schedule: aggressive decoys at night, stealth during work calls  
- Kid mode: block admin morphs, show simple status light (green/yellow/red)  

### 7. One-click weekly email/PDF report
- “This week: 12 scanners, 0 false positives, champion genome X”  
- Pretty enough to forward to a spouse or co-op board  
- Optional: email via local SMTP or agent-email  

### 8. Smart home & IoT decoys that feel familiar
- Personas: Ring-like cam, printer, NAS, Roku, game console  
- Rotate only within “looks like my house” archetypes  
- Warn if real IoT is exposed (check open ports on owned range only)  

### 9. Neighbor / mesh light federation (opt-in)
- Share anonymized scanner fingerprints with friends’ Ghost nodes  
- “3 homes on your street saw this scanner IP”  
- Still local control; no raw traffic export by default  

### 10. Backup & restore of immune state
- Export genomes + config + sealed incidents to USB  
- Disaster recovery after PC rebuild  

### 11. Integration marketplace (read-only / defensive)
- Home Assistant sensor: `binary_sensor.ghost_threat`  
- Discord/Telegram notify webhooks (outbound only)  
- Unifi/Firewall log tail adapters  

### 12. Accessibility & trust
- Reduced-motion Nexus  
- High-contrast mode  
- Clear “what data leaves this PC: nothing unless you export” banner every session  

### 13. Game-like progression (optional)
- Badges: first trap trip, first sealed incident, 30-day clean  
- Don’t gamify fear — celebrate hygiene and learning  

### 14. Offline install kit
- USB image / winget / brew one-liners  
- Vendored Three.js for air-gapped cabins  

### 15. Professional “renter / apartment” profile
- No LAN control of router → Edge + Audit + Narrative only  
- Explains limits honestly  

## Engineering spikes that unlock the above

| Spike | Unlocks |
|-------|---------|
| Plane toggle UX (done) | Per-layer control for scared-of-complexity users |
| Threat assess/respond (done) | Trust that the tool *does something* |
| Config wizard + profiles | Time-to-value under 5 minutes |
| Notification bus | Mobile / Home Assistant |
| Device allowlist | Lower false anxiety |
| Report templates | Shareable proof of value |

## Messaging that sells to home managers

- “Decoys that learn — not a camera feed you never watch”  
- “Courtroom memory when something weird happens”  
- “Runs on your PC. Your data stays home.”  
- “Demo mode for fun. Live mode for truth.”  

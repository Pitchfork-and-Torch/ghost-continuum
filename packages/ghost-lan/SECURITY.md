# Security

Ghost LAN is **defensive tooling** for your local network. Read this before deploying.

## Intended use

- Run on a machine you own, on a private LAN
- Detect and log probes against decoy services
- Optionally beacon events to an endpoint **you** control

Do not use Ghost LAN to deceive networks you do not own or operate.

## Deployment rules

1. **Never port-forward** honeypot ports (8080, 8443, 5901, rotating 40xxx) to the internet.
2. **Keep the dashboard local** — it binds to `127.0.0.1:29999` only.
3. **Tripwire URLs are sensitive** — a public URL in your config can be spammed. Use your own worker; keep the URL out of git.
4. **Beacons are off by default** — enable `beaconEnabled` only after setting `tripwireUrl`.
5. **Firewall rules** (optional installer flag) scope inbound to `localsubnet` on the private profile only.

## What Ghost LAN does not do

- Harvest or store real credentials
- Attack or scan remote networks
- Exfiltrate LAN data beyond your configured tripwire POSTs

## Reporting issues

Open a [GitHub Issue](https://github.com/Pitchfork-and-Torch/ghost-continuum/issues) (title prefix `Security:`) for vulnerabilities or safety concerns.
# LAN Worm Incident Runbook

**For:** Windows home LAN + Ghost LAN deception layer  
**Ghost LAN path:** `packages/ghost-lan` (from ghost-continuum repo root)  
**Runtime data:** `~/.ghost-lan/`  
**Dashboard:** http://127.0.0.1:29999 (localhost only)

Ghost LAN is **early warning and evidence**, not a blocker. A worm on a real host will still spread if SMB/RDP is open and patches are missing. This runbook uses Ghost LAN to **detect** and Windows tools to **contain and clean**.

---

## 0. Know the symptoms (when to open this doc)

| Signal | Likely meaning |
|--------|----------------|
| Many devices slow / disk churn at once | Lateral scan or encryptor staging |
| Router shows LAN→LAN SMB (445) or RDP (3389) bursts | Worm or ransomware prep |
| Ghost LAN `trap-trip` or dossier spike from **internal** IPs | Something on your LAN is probing decoys |
| New unknown processes on multiple PCs | Propagation |
| Guest Wi‑Fi devices hitting honeypots | Isolated — lower priority unless VLAN bleeds |

**False positives:** Your own security scans, Shodan-style crawlers from ISP, integration tests, `ghost-lan rotate` after trap hits.

---

## 1. First 5 minutes — contain (do this before deep analysis)

### 1.1 Do not panic-shutdown Ghost LAN

Keep the sentinel running so it keeps logging. Evidence lives in `events.jsonl` and `dossiers.json`.

```powershell
cd packages/ghost-lan
node bin/ghost-lan.js doctor
node bin/ghost-lan.js status
```

If offline: `node bin/ghost-lan.js start` (background).

### 1.2 Isolate the sick host(s)

Pick the **minimum** that stops spread:

1. **Router:** Block or quarantine the suspect device (MAC ban, guest isolation, or unplug Ethernet).
2. **Wi‑Fi:** Disable guest network if compromise might be there.
3. **Do not** disconnect the Ghost LAN host yet if it's your only sensor — isolate *other* machines first.

### 1.3 Cut worm highways on the LAN (router or Windows Firewall)

Block **inbound** on untrusted segments (especially IoT / guest):

| Port | Service | Worm relevance |
|------|---------|----------------|
| 445 | SMB | EternalBlue-style, ransomware spread |
| 135 | RPC | Windows lateral movement |
| 139 | NetBIOS | Legacy SMB |
| 3389 | RDP | Brute force + worm payloads |
| 5985/5986 | WinRM | Lateral movement |

Trusted PCs can keep SMB if you need file shares — but **IoT and guest VLANs must not reach 445 on PCs**.

### 1.4 Snapshot evidence (60 seconds)

```powershell
cd packages/ghost-lan
powershell -ExecutionPolicy Bypass -File scripts\incident-triage.ps1
```

Output lands in `$env:USERPROFILE\.ghost-lan\incident-snapshots\` with a timestamp.

---

## 2. Ghost LAN — what to read (minutes 5–15)

### 2.1 Live dashboard

```powershell
node bin/ghost-lan.js dashboard
```

Open **Probe Dossiers** — sort mentally by:

- **High hit count** from one IP
- **`probeClass: scanner`** or script UAs (curl, masscan, nmap)
- **Many ports** in short time
- **Internal IP** (192.168.x.x) hitting traps — strong signal of compromised LAN device

### 2.2 Event log (CLI)

```powershell
node bin/ghost-lan.js logs --tail 100
```

| Event type | Meaning |
|------------|---------|
| `honeypot-http` / `honeypot-tcp` | Probe logged; check `detail.ip`, `detail.url`, `detail.probeClass` |
| `trap-trip` | Attacker touched `/.env`, `/.git`, `wp-admin`, etc. — persona morphed, IP silenced (except loopback) |
| `rotate` | Persona changed — note `detail.reason` (`trap`, `hit-threshold`, `rule:scanner-ua`, …) |
| `sentinel-stop` / `sentinel-crash` | Sensor gap — restart and note time window |
| `listener-error` | Port conflict — honeypot blind on that port |

### 2.3 Raw files (chain of custody)

| File | Contents |
|------|----------|
| `~/.ghost-lan/events.jsonl` | Append-only timeline (copy before rotate/cleanup) |
| `~/.ghost-lan/dossiers.json` | Per-IP probe history, generations seen |
| `~/.ghost-lan/state.json` | Current persona, ports, generation |
| `~/.ghost-lan/sentinel.log` | Background daemon stdout |

Copy snapshot:

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = "$env:USERPROFILE\.ghost-lan\incident-snapshots\$ts"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "$env:USERPROFILE\.ghost-lan\events.jsonl" $dest
Copy-Item "$env:USERPROFILE\.ghost-lan\dossiers.json" $dest
Copy-Item "$env:USERPROFILE\.ghost-lan\state.json" $dest
node packages/ghost-lan\bin\ghost-lan.js logs --tail 200 | Out-File "$dest\logs-tail.txt"
```

### 2.4 Interpretation rules

- **External IP** + scanner UA → internet noise (still log).
- **192.168.x.x** + trap-trip or high-frequency honeypot hits → **treat as internal threat** until proven otherwise.
- **Generation climbing fast** → many trap hits or rotate rules firing; check `detail.reason` in events.
- Ghost LAN **cannot** tell you which process on the remote machine is malicious — only that **that IP** is probing.

---

## 3. Windows triage on the Ghost LAN host (and any isolated suspect PC)

Run on each machine you can still touch safely.

### 3.1 Network connections

```powershell
Get-NetTCPConnection -State Established |
  Where-Object { $_.RemotePort -in 445,135,139,3389,5985,5986 } |
  Select-Object LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess |
  Sort-Object RemoteAddress
```

```powershell
netstat -ano | findstr "ESTABLISHED"
```

Map PID → process:

```powershell
Get-Process -Id <PID> | Select-Object Id, ProcessName, Path
```

### 3.2 Suspicious processes (quick pass)

```powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath -notmatch 'Windows\\|Program Files' } |
  Select-Object ProcessId, Name, ExecutablePath |
  Sort-Object Name
```

Look for: random names in `%TEMP%`, `%APPDATA%`, unsigned binaries, duplicate `svchost` with wrong parent.

### 3.3 Persistence (worm survival)

```powershell
Get-CimInstance Win32_StartupCommand | Select-Object Name, Command, Location
Get-ScheduledTask | Where-Object { $_.State -eq 'Ready' } | Select-Object TaskName, TaskPath
Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Run
Get-ItemProperty HKCU:\Software\Microsoft\Windows\CurrentVersion\Run
```

### 3.4 SMB / RDP exposure on this PC

```powershell
Get-Service LanmanServer, TermService | Select-Object Name, Status, StartType
Get-NetFirewallRule -DisplayGroup "File and Printer Sharing" | Where-Object { $_.Enabled -eq 'True' } | Select-Object DisplayName, Direction, Action
```

**Containment lever:** Stop Server service only if you accept breaking shares on that box:

```powershell
Stop-Service LanmanServer -Force   # temporary — document why
```

### 3.5 Patch status (common worm gates)

```powershell
Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 15 HotFixID, InstalledOn
```

EternalBlue-class: ensure SMBv1 disabled, MS17-010 era patches present on older systems.

---

## 4. Find patient zero (minutes 15–45)

Work backward from Ghost LAN dossiers + router DHCP logs:

1. **Earliest internal IP** in `events.jsonl` with scanner-like behavior.
2. **Router admin** → DHCP client list / traffic stats → map IP to device name/MAC.
3. **Correlate time:** first `trap-trip` or SMB scan wave vs. when a device installed an update / opened an attachment.
4. **Check IoT defaults** — cameras, NAS, old tablets often source LAN scans.

Decision table:

| Evidence | Likely patient zero |
|----------|---------------------|
| One IP hits all honeypot ports in sequence | That host |
| Multiple IPs, same minute | Compromised router or multicast trigger |
| Only guest subnet | Guest device — keep guest VLAN firewalled |

---

## 5. Eradicate

Per isolated host (never rejoin LAN until clean):

1. **Disconnect network** (already done in §1).
2. **Full AV scan** — Windows Defender offline scan if needed:
   ```powershell
   Start-MpScan -ScanType FullScan
   ```
3. **Remove persistence** found in §3.3 (tasks, Run keys, services).
4. **Rotate all credentials** touched from that device: Wi‑Fi PSK, NAS, email, Microsoft account, VPN.
5. **Reimage** if ransomware, rootkit, or unknown kernel driver — faster than trust-based cleanup.

On the **router:** firmware update, change admin password, disable WAN admin, review port forwards (none should point to honeypot ports).

---

## 6. Recover safely

1. Re-enable VLANs / firewall rules **gradually**.
2. `node bin/ghost-lan.js status` — confirm sentinel online before rejoining other devices.
3. Watch dashboard 24–48h for **repeat internal dossiers** from same IP/MAC.
4. Optional: force persona reset after incident:
   ```powershell
   node bin/ghost-lan.js rotate
   ```

---

## 7. Post-incident checklist

- [ ] Incident snapshot folder saved under `~/.ghost-lan/incident-snapshots/`
- [ ] Patient zero identified (IP, MAC, device name)
- [ ] SMB/RDP blocked from IoT/guest to trusted LAN
- [ ] Passwords rotated (router, NAS, Microsoft, Wi‑Fi)
- [ ] Patches applied on all Windows machines
- [ ] Ghost LAN autostart verified: `ghost-lan doctor`
- [ ] Note lessons (which port/service enabled spread)

---

## 8. Cheat sheet (one screen)

```powershell
# Sensor health
cd packages/ghost-lan
node bin/ghost-lan.js doctor
node bin/ghost-lan.js status
node bin/ghost-lan.js logs --tail 50

# Full triage bundle
powershell -ExecutionPolicy Bypass -File scripts\incident-triage.ps1

# Dashboard
node bin/ghost-lan.js dashboard

# Evidence copy
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = "$env:USERPROFILE\.ghost-lan\incident-snapshots\$ts"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item "$env:USERPROFILE\.ghost-lan\*.json*" $dest -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.ghost-lan\events.jsonl" $dest -ErrorAction SilentlyContinue
```

---

## 9. When to escalate

- Ransom note or encrypted files → **stop**, do not pay blindly, preserve disk images, call law enforcement if needed.
- Active exfiltration (large uploads to unknown IPs) → isolate WAN, preserve logs.
- You need hands-on help → bring Ghost LAN snapshot + `incident-triage.ps1` output to your next support session.

---

*Ghost LAN v0.2+ — deception layer only. This runbook is local ops documentation; keep tripwire URLs and LAN specifics out of public repos.*
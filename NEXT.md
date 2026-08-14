# Next (Ghost Continuum)

Low-risk leftover for the next COOK tick:

1. Hub rate-limit identity: ignore `X-Forwarded-For` unless `hubTrustProxy` / `GC_HUB_TRUST_PROXY=1`. Even then, the first hop must pass Node `net.isIP`; garbage falls back to the socket address. Do not bump the version.

Hold (not a COOK leftover): hardened eBPF probes, K8s operator, hosted plugin registry, production Tauri builds.

# Optional convenience image for Ghost Continuum.
# Core engine remains zero npm runtime dependencies — this only packages Node + source.
# Defensive / local-first: bind hub to loopback in production; do not expose honeypots publicly.

FROM node:20-alpine

LABEL org.opencontainers.image.title="Ghost Continuum" \
      org.opencontainers.image.description="Living Digital Immune System — v3.0 OMEGA ASCENDANT" \
      org.opencontainers.image.source="https://github.com/Pitchfork-and-Torch/ghost-continuum" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Copy monorepo (no install required for core — zero runtime deps)
COPY package.json ./
COPY bin ./bin
COPY packages ./packages
COPY config.example.json ./
COPY LEGAL.md SECURITY.md LICENSE ./

# Persistent operator data
ENV GC_HOME=/data
RUN mkdir -p /data

EXPOSE 30000

# Hub + stack on 0.0.0.0 only if you intentionally publish (default scripts use 127.0.0.1).
# Prefer docker-compose host networking or tunnel rather than exposing honeypot ports.
CMD ["node", "bin/start-stack.js"]

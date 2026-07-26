---
name: Deploy scripts
description: Which deployment script does what
---

## Scripts

| File | Purpose |
|------|---------|
| `deploy.sh` | Quick Docker-based deploy — Docker CE, app stack. Idempotent. Reads `.env`. |
| `setup-ubuntu.sh` | Full production hardening — nginx, UFW, fail2ban, sysctl, optional WAF. |
| `docker-compose.yml` | Full CLI stack: virtualbank + litenode + watchtower + webhook. |
| `Dockerfile` | Multi-stage build; VITE_ vars injected at container runtime (not bake-time) via `docker/generate-env.sh`. |

**Why separate deploy.sh vs setup-ubuntu.sh:** deploy.sh gets the app running in minutes (Docker path); setup-ubuntu.sh is for when you want nginx/bare-metal hardening with full security controls. Both are idempotent.

**Key behaviour:** deploy.sh creates `/opt/virtualbank/` with docker-compose.yml + .env and shows access URLs at end.

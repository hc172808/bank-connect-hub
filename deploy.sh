#!/usr/bin/env bash
# =============================================================================
#  Virtual Bank / NETLIFE CASH — Quick Deploy Script
#  Supports: Ubuntu 20.04, 22.04, 24.04 | Debian 11/12 | Rocky/Alma Linux
#
#  Usage:
#    # Fresh server — interactive first run:
#    sudo bash deploy.sh
#
#    # Non-interactive (fill .env first):
#    cp .env.example .env && nano .env
#    sudo bash deploy.sh
#
#  What this installs:
#    ✓ Docker CE + Docker Compose v2
#    ✓ Portainer CE  (https://your-server-ip:9443)
#    ✓ Full app stack via docker-compose  (virtualbank + litenode + watchtower)
#    ✓ UFW firewall (minimal rules for Docker ports)
#    ✓ Optional: Let's Encrypt SSL via nginx proxy
#
#  For full production hardening (fail2ban, WAF, sysctl) use setup-ubuntu.sh
# =============================================================================
set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; CYN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GRN}[deploy]${NC} $*"; }
info() { echo -e "${BLU}[info  ]${NC} $*"; }
warn() { echo -e "${YLW}[warn  ]${NC} $*"; }
err()  { echo -e "${RED}[error ]${NC} $*" >&2; exit 1; }
ok()   { echo -e "${GRN}[  ✓   ]${NC} $*"; }
ask()  { echo -e "${CYN}[input ]${NC} $*"; }

[[ $EUID -eq 0 ]] || err "Run as root:  sudo bash deploy.sh"

echo ""
echo -e "${BLU}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLU}║      Virtual Bank — Quick Deploy  (Docker + Portainer)    ║${NC}"
echo -e "${BLU}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# STEP 0 — .env bootstrap
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo -e "${YLW}"
    echo "  ┌──────────────────────────────────────────────────────────────┐"
    echo "  │  .env created from .env.example                              │"
    echo "  │                                                              │"
    echo "  │  ACTION REQUIRED — open the file and fill in your values:   │"
    echo "  │    nano ${ENV_FILE}"
    echo "  │                                                              │"
    echo "  │  Then re-run:  sudo bash deploy.sh                          │"
    echo "  └──────────────────────────────────────────────────────────────┘"
    echo -e "${NC}"
    exit 0
  fi
fi

# Source .env if present
if [[ -f "$ENV_FILE" ]]; then
  log "Sourcing configuration from .env…"
  set +u
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set -u
  ok ".env loaded"
fi

# =============================================================================
# STEP 1 — Gather any missing values interactively
# =============================================================================
if [[ -z "${GITHUB_USER:-}" ]]; then
  ask "GitHub username (lowercase):"; read -r GITHUB_USER
fi
if [[ -z "${GITHUB_REPO:-}" ]]; then
  ask "GitHub repository name:"; read -r GITHUB_REPO
fi
if [[ -z "${GITHUB_PAT:-}" ]]; then
  ask "GitHub PAT (read:packages scope):"; read -rs GITHUB_PAT; echo ""
fi
if [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
  ask "Supabase URL (https://xxx.supabase.co):"; read -r VITE_SUPABASE_URL
fi
if [[ -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  ask "Supabase anon/public key:"; read -r VITE_SUPABASE_PUBLISHABLE_KEY
fi

APP_PORT="${APP_PORT:-3000}"
UPSTREAM_RPC="${UPSTREAM_RPC:-https://bsc-dataseed.binance.org}"
DOMAIN_NAME="${DOMAIN_NAME:-}"
SSL_EMAIL="${SSL_EMAIL:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(openssl rand -hex 32)}"

SERVER_IP=$(curl -sf --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')

echo ""
log "Deploy configuration:"
info "  Image       : ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest"
info "  App port    : ${APP_PORT}"
info "  Supabase    : ${VITE_SUPABASE_URL}"
info "  Domain      : ${DOMAIN_NAME:-${SERVER_IP} (IP only)}"
info "  SSL         : ${SSL_EMAIL:-skipped}"
echo ""

# =============================================================================
# STEP 2 — Detect OS & install prerequisites
# =============================================================================
log "Detecting package manager…"
if   command -v apt-get &>/dev/null; then PKG="apt"
elif command -v dnf     &>/dev/null; then PKG="dnf"
elif command -v yum     &>/dev/null; then PKG="yum"
else err "Unsupported OS — need apt, dnf, or yum"; fi

case "$PKG" in
  apt)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl wget git ca-certificates gnupg lsb-release \
      ufw openssl jq net-tools
    ;;
  dnf|yum)
    $PKG update -y -q
    $PKG install -y -q curl wget git ca-certificates gnupg openssl jq net-tools firewalld
    ;;
esac
ok "Prerequisites installed"

# =============================================================================
# STEP 3 — Install Docker CE (idempotent)
# =============================================================================
if ! command -v docker &>/dev/null; then
  log "Installing Docker CE…"
  case "$PKG" in
    apt)
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg" \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/$(. /etc/os-release; echo "$ID") \
        $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
      ;;
    dnf|yum)
      $PKG install -y -q yum-utils
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      $PKG install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
  esac
  systemctl enable --now docker
  ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1) installed"
else
  ok "Docker already present: $(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)"
fi

# Verify Compose v2
docker compose version &>/dev/null || err "Docker Compose v2 not found. Update Docker."

# =============================================================================
# STEP 4 — UFW firewall (minimal)
# =============================================================================
if command -v ufw &>/dev/null; then
  log "Configuring firewall…"
  ufw --force reset     &>/dev/null
  ufw default deny incoming
  ufw default allow outgoing
  SSH_PORT=$(ss -tlnp 2>/dev/null | grep sshd | awk '{print $4}' | cut -d: -f2 | head -1)
  ufw allow "${SSH_PORT:-22}/tcp" comment "SSH"
  ufw allow "${APP_PORT}/tcp"    comment "VirtualBank app"
  ufw allow 9000/tcp             comment "Deploy webhook"
  ufw allow 9443/tcp             comment "Portainer"
  [[ -n "${DOMAIN_NAME}" ]] && ufw allow 80/tcp && ufw allow 443/tcp
  ufw --force enable &>/dev/null
  ok "Firewall configured"
fi

# =============================================================================
# STEP 5 — Authenticate with GHCR
# =============================================================================
log "Authenticating with GitHub Container Registry…"
echo "${GITHUB_PAT}" | docker login ghcr.io -u "${GITHUB_USER}" --password-stdin
ok "GHCR authenticated"

# =============================================================================
# STEP 6 — Write docker-compose stack & environment
# =============================================================================
APP_DIR="/opt/virtualbank"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

log "Writing docker-compose.yml to ${APP_DIR}…"
cat > docker-compose.yml << COMPOSE
# Auto-generated by deploy.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
services:

  virtualbank:
    image: ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest
    container_name: virtualbank
    restart: unless-stopped
    ports:
      - "${APP_PORT}:80"
    environment:
      - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
      - VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
      - VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID:-}
      - VITE_WHATSAPP_SUPPORT_NUMBER=${VITE_WHATSAPP_SUPPORT_NUMBER:-}
      - NODE_ENV=production
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /var/cache/nginx:size=64m,mode=0755
      - /var/run:size=4m,mode=0755
      - /tmp:size=16m,mode=1777
    cap_drop: [ALL]
    cap_add:  [NET_BIND_SERVICE]
    deploy:
      resources:
        limits: { cpus: "1.0", memory: 256M }
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
    networks: [frontend]

  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker/config.json:/config.json:ro
    environment:
      - WATCHTOWER_POLL_INTERVAL=300
      - WATCHTOWER_LABEL_ENABLE=true
      - WATCHTOWER_CLEANUP=true
    deploy:
      resources:
        limits: { cpus: "0.1", memory: 32M }
    networks: [backend]

  webhook:
    image: almir/webhook:latest
    container_name: virtualbank-webhook
    restart: unless-stopped
    ports: ["9000:9000"]
    volumes:
      - ${APP_DIR}/webhook-hooks.json:/etc/webhook/hooks.json:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - /usr/bin/docker:/usr/bin/docker:ro
    command: ["-hooks=/etc/webhook/hooks.json", "-verbose"]
    deploy:
      resources:
        limits: { cpus: "0.1", memory: 32M }
    networks: [backend]

networks:
  frontend:
    name: virtualbank-frontend
  backend:
    name: virtualbank-backend
COMPOSE

# Webhook hooks
cat > webhook-hooks.json << HOOKS
[{
  "id": "redeploy",
  "execute-command": "/usr/bin/docker",
  "command-working-directory": "${APP_DIR}",
  "pass-arguments-to-command": [
    {"source":"string","name":"compose"},
    {"source":"string","name":"-f"},
    {"source":"string","name":"${APP_DIR}/docker-compose.yml"},
    {"source":"string","name":"pull"}
  ],
  "trigger-rule": {
    "match": {
      "type": "value",
      "value": "${WEBHOOK_SECRET}",
      "parameter": {"source":"header","name":"X-Webhook-Secret"}
    }
  }
}]
HOOKS

# Write runtime .env
cat > .env << ENV
GITHUB_USER=${GITHUB_USER}
GITHUB_REPO=${GITHUB_REPO}
APP_PORT=${APP_PORT}
VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID:-}
UPSTREAM_RPC=${UPSTREAM_RPC}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
ENV
chmod 600 .env
ok "Stack files written to ${APP_DIR}"

# =============================================================================
# STEP 7 — Pull images and start stack
# =============================================================================
log "Pulling Docker images…"
docker compose pull

log "Starting application stack…"
docker compose up -d

# Wait for health
log "Waiting for app container to become healthy…"
for i in {1..30}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' virtualbank 2>/dev/null || echo "missing")
  [[ "$STATUS" == "healthy" ]] && { ok "App container is healthy"; break; }
  [[ "$STATUS" == "missing" ]] && { warn "Container not found yet…"; }
  sleep 2
done

# =============================================================================
# STEP 8 — Portainer CE
# =============================================================================
log "Setting up Portainer CE…"
docker volume create portainer_data &>/dev/null || true
if ! docker ps -a --format '{{.Names}}' | grep -q '^portainer$'; then
  docker run -d \
    --name portainer \
    --restart=unless-stopped \
    -p 9443:9443 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v portainer_data:/data \
    portainer/portainer-ce:latest
  ok "Portainer installed"
else
  docker start portainer &>/dev/null || true
  ok "Portainer already exists — started"
fi

# =============================================================================
# STEP 9 — Optional SSL with Certbot
# =============================================================================
if [[ -n "${DOMAIN_NAME}" && -n "${SSL_EMAIL}" ]]; then
  log "Installing Certbot + nginx for SSL on ${DOMAIN_NAME}…"
  case "$PKG" in
    apt)
      apt-get install -y -qq nginx certbot python3-certbot-nginx
      cat > /etc/nginx/conf.d/virtualbank.conf << NGINX
server {
    listen 80;
    server_name ${DOMAIN_NAME};
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
      nginx -t && systemctl enable --now nginx
      certbot --nginx -d "${DOMAIN_NAME}" --email "${SSL_EMAIL}" \
        --agree-tos --non-interactive --redirect
      (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") \
        | sort -u | crontab -
      ok "SSL certificate installed for ${DOMAIN_NAME}"
      ;;
    *) warn "Auto-SSL only supported on Debian/Ubuntu — configure nginx manually" ;;
  esac
fi

# =============================================================================
# STEP 10 — Save webhook secret
# =============================================================================
CREDS_FILE="${APP_DIR}/deploy-info.txt"
cat > "$CREDS_FILE" << INFO
# Virtual Bank — Deploy Info ($(date -u))
APP_URL=http://${DOMAIN_NAME:-${SERVER_IP}}:${APP_PORT}
PORTAINER_URL=https://${SERVER_IP}:9443
WEBHOOK_URL=http://${SERVER_IP}:9000/hooks/redeploy
WEBHOOK_SECRET=${WEBHOOK_SECRET}
INFO
chmod 600 "$CREDS_FILE"

# =============================================================================
# Done!
# =============================================================================
echo ""
echo -e "${GRN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║               Deploy Complete  🚀                         ║${NC}"
echo -e "${GRN}╠═══════════════════════════════════════════════════════════╣${NC}"
if [[ -n "${DOMAIN_NAME}" ]]; then
echo -e "${GRN}║  App URL:         https://${DOMAIN_NAME}$(printf '%*s' $((35 - ${#DOMAIN_NAME})) '')║${NC}"
else
echo -e "${GRN}║  App URL:         http://${SERVER_IP}:${APP_PORT}$(printf '%*s' $((28 - ${#SERVER_IP} - ${#APP_PORT})) '')║${NC}"
fi
echo -e "${GRN}║  Portainer:       https://${SERVER_IP}:9443$(printf '%*s' $((26 - ${#SERVER_IP})) '')║${NC}"
echo -e "${GRN}║  Webhook:         http://${SERVER_IP}:9000/hooks/redeploy$(printf '%*s' $((9 - ${#SERVER_IP})) '')║${NC}"
echo -e "${GRN}║  Credentials:     ${CREDS_FILE}$(printf '%*s' $((40 - ${#CREDS_FILE})) '')║${NC}"
echo -e "${GRN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  To view logs:   ${CYN}docker compose -f ${APP_DIR}/docker-compose.yml logs -f${NC}"
echo -e "  To update app:  ${CYN}docker compose -f ${APP_DIR}/docker-compose.yml pull && docker compose -f ${APP_DIR}/docker-compose.yml up -d${NC}"
echo ""

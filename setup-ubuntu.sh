#!/usr/bin/env bash
# =============================================================================
#  Virtual Bank — Ubuntu 22.04 Server Setup
#  Run as root on a fresh Ubuntu 22.04 VPS:
#    curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/setup-ubuntu.sh | bash
#  Or clone the repo first and run:
#    chmod +x setup-ubuntu.sh && sudo ./setup-ubuntu.sh
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; CYN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GRN}[setup]${NC} $*"; }
info() { echo -e "${BLU}[info ]${NC} $*"; }
warn() { echo -e "${YLW}[warn ]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }
ask()  { echo -e "${CYN}[input]${NC} $*"; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || err "Run this script as root: sudo ./setup-ubuntu.sh"

# ── Ubuntu 22.04 check ────────────────────────────────────────────────────────
if ! grep -q "22.04" /etc/os-release 2>/dev/null; then
  warn "This script is written for Ubuntu 22.04. Continuing anyway..."
fi

echo ""
echo -e "${BLU}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLU}║       Virtual Bank — Server Setup Script          ║${NC}"
echo -e "${BLU}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# STEP 1 — Collect configuration
# =============================================================================
log "Collecting configuration..."
echo ""

ask "GitHub username (lowercase):"
read -r GITHUB_USER

ask "GitHub repository name (lowercase, e.g. virtualbank):"
read -r GITHUB_REPO

ask "Domain name for this server (e.g. bank.example.com) — leave blank to use IP only:"
read -r DOMAIN_NAME

ask "Email address for SSL certificate (Let's Encrypt) — leave blank to skip SSL:"
read -r SSL_EMAIL

ask "Port to expose the app on (default: 3000):"
read -r APP_PORT
APP_PORT="${APP_PORT:-3000}"

# Generate a random webhook secret
WEBHOOK_SECRET=$(openssl rand -hex 32)

APP_DIR="/opt/virtualbank"

echo ""
log "Config summary:"
info "  GitHub image : ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest"
info "  App directory: $APP_DIR"
info "  App port     : $APP_PORT"
info "  Domain       : ${DOMAIN_NAME:-<server IP>}"
info "  SSL          : ${SSL_EMAIL:-no}"
echo ""

# =============================================================================
# STEP 2 — System update & base packages
# =============================================================================
log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
  curl wget git unzip gnupg lsb-release ca-certificates \
  ufw fail2ban software-properties-common apt-transport-https

# =============================================================================
# STEP 3 — Install Docker (official apt method)
# =============================================================================
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  log "Docker $(docker --version) installed ✓"
else
  log "Docker already installed: $(docker --version)"
fi

# =============================================================================
# STEP 4 — GHCR login (to pull private images)
# =============================================================================
log "Setting up GitHub Container Registry authentication..."
ask "GitHub Personal Access Token (PAT) with read:packages scope"
ask "(Create at https://github.com/settings/tokens — select 'read:packages'):"
read -rs GITHUB_PAT
echo ""
echo "${GITHUB_PAT}" | docker login ghcr.io -u "${GITHUB_USER}" --password-stdin
log "GHCR login saved to /root/.docker/config.json ✓"

# =============================================================================
# STEP 5 — Configure firewall (UFW)
# =============================================================================
log "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow "${APP_PORT}/tcp" comment "Virtual Bank app"
ufw allow 9000/tcp comment "Deploy webhook"
[[ -n "$DOMAIN_NAME" ]] && { ufw allow 80/tcp comment "HTTP"; ufw allow 443/tcp comment "HTTPS"; }
ufw --force enable
log "Firewall configured ✓"

# =============================================================================
# STEP 6 — Fail2ban (brute-force protection)
# =============================================================================
log "Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# =============================================================================
# STEP 7 — Create app directory and write config files
# =============================================================================
log "Creating app directory at $APP_DIR..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Write docker-compose.yml
cat > docker-compose.yml << COMPOSE
services:

  virtualbank:
    image: ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest
    container_name: virtualbank
    restart: unless-stopped
    ports:
      - "${APP_PORT}:80"
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

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
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

  webhook:
    image: almir/webhook:latest
    container_name: virtualbank-webhook
    restart: unless-stopped
    ports:
      - "9000:9000"
    volumes:
      - ${APP_DIR}/webhook-hooks.json:/etc/webhook/hooks.json:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - /usr/bin/docker:/usr/bin/docker:ro
    command: ["-hooks=/etc/webhook/hooks.json", "-verbose"]
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

networks:
  default:
    name: virtualbank-net
COMPOSE

# Write webhook hooks config
cat > webhook-hooks.json << HOOKS
[
  {
    "id": "redeploy",
    "execute-command": "/usr/bin/docker",
    "command-working-directory": "${APP_DIR}",
    "pass-arguments-to-command": [
      { "source": "string", "name": "compose" },
      { "source": "string", "name": "-f" },
      { "source": "string", "name": "${APP_DIR}/docker-compose.yml" },
      { "source": "string", "name": "pull" }
    ],
    "trigger-rule": {
      "match": {
        "type": "value",
        "value": "${WEBHOOK_SECRET}",
        "parameter": {
          "source": "header",
          "name": "X-Webhook-Secret"
        }
      }
    }
  }
]
HOOKS

# Write .env for reference
cat > .env << ENV
GITHUB_USER=${GITHUB_USER}
GITHUB_REPO=${GITHUB_REPO}
APP_PORT=${APP_PORT}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
ENV

chmod 600 .env
log "Config files written ✓"

# =============================================================================
# STEP 8 — Pull and start the stack
# =============================================================================
log "Pulling Docker images and starting stack..."
docker compose pull
docker compose up -d

# Wait for health check
log "Waiting for app to be healthy..."
for i in {1..30}; do
  if docker inspect --format='{{.State.Health.Status}}' virtualbank 2>/dev/null | grep -q "healthy"; then
    log "App is healthy ✓"; break
  fi
  sleep 2
done

# =============================================================================
# STEP 9 — Nginx reverse proxy + SSL (optional)
# =============================================================================
if [[ -n "$DOMAIN_NAME" && -n "$SSL_EMAIL" ]]; then
  log "Installing nginx and certbot for SSL..."
  apt-get install -y -qq nginx python3-certbot-nginx

  # Write nginx site config
  cat > "/etc/nginx/sites-available/virtualbank" << NGINX
server {
    listen 80;
    server_name ${DOMAIN_NAME};

    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Deploy webhook — proxied on /hooks path so only port 443 needed publicly
    location /hooks/ {
        proxy_pass http://127.0.0.1:9000/hooks/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/virtualbank /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  log "Obtaining SSL certificate from Let's Encrypt..."
  certbot --nginx -d "$DOMAIN_NAME" --email "$SSL_EMAIL" \
    --agree-tos --non-interactive --redirect
  log "SSL certificate installed ✓"

  # Auto-renew cron
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

elif [[ -n "$DOMAIN_NAME" ]]; then
  log "Installing nginx (no SSL — domain set but no email provided)..."
  apt-get install -y -qq nginx
  cat > "/etc/nginx/sites-available/virtualbank" << NGINX
server {
    listen 80;
    server_name ${DOMAIN_NAME};
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX
  ln -sf /etc/nginx/sites-available/virtualbank /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
fi

# =============================================================================
# STEP 10 — Create a handy management script
# =============================================================================
cat > /usr/local/bin/vbank << 'MGMT'
#!/usr/bin/env bash
# Virtual Bank management helper
APP_DIR="/opt/virtualbank"
case "${1:-}" in
  status)  docker compose -f "$APP_DIR/docker-compose.yml" ps ;;
  logs)    docker compose -f "$APP_DIR/docker-compose.yml" logs -f --tail=100 "${@:2}" ;;
  restart) docker compose -f "$APP_DIR/docker-compose.yml" restart ;;
  update)  docker compose -f "$APP_DIR/docker-compose.yml" pull && \
           docker compose -f "$APP_DIR/docker-compose.yml" up -d ;;
  stop)    docker compose -f "$APP_DIR/docker-compose.yml" down ;;
  start)   docker compose -f "$APP_DIR/docker-compose.yml" up -d ;;
  *)
    echo "Usage: vbank <status|logs|restart|update|stop|start>"
    echo ""
    echo "  status   — show container status"
    echo "  logs     — tail live logs (add 'virtualbank' or 'watchtower' to filter)"
    echo "  restart  — restart all containers"
    echo "  update   — pull latest image and restart"
    echo "  stop     — stop everything"
    echo "  start    — start everything"
    ;;
esac
MGMT
chmod +x /usr/local/bin/vbank

# =============================================================================
# DONE — Print summary
# =============================================================================
SERVER_IP=$(curl -sf https://api.ipify.org || hostname -I | awk '{print $1}')

echo ""
echo -e "${GRN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║                    Setup Complete! ✓                     ║${NC}"
echo -e "${GRN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLU}  App URL:${NC}"
if [[ -n "$DOMAIN_NAME" && -n "$SSL_EMAIL" ]]; then
echo -e "    https://${DOMAIN_NAME}"
else
echo -e "    http://${SERVER_IP}:${APP_PORT}"
fi
echo ""
echo -e "${BLU}  Portainer URL (if installed):${NC}"
echo -e "    http://${SERVER_IP}:9443"
echo ""
echo -e "${BLU}  Deploy webhook URL${NC} (paste this into GitHub Secrets as DEPLOY_WEBHOOK_URL):"
if [[ -n "$DOMAIN_NAME" && -n "$SSL_EMAIL" ]]; then
echo -e "    ${CYN}https://${DOMAIN_NAME}/hooks/redeploy${NC}"
else
echo -e "    ${CYN}http://${SERVER_IP}:9000/hooks/redeploy${NC}"
fi
echo ""
echo -e "${BLU}  Webhook secret${NC} (paste into GitHub Secrets as DEPLOY_WEBHOOK_SECRET):"
echo -e "    ${CYN}${WEBHOOK_SECRET}${NC}"
echo ""
echo -e "${BLU}  Required GitHub Secrets (Settings → Secrets → Actions):${NC}"
echo -e "    VITE_SUPABASE_URL"
echo -e "    VITE_SUPABASE_PUBLISHABLE_KEY"
echo -e "    VITE_WHATSAPP_SUPPORT_NUMBER"
echo -e "    DEPLOY_WEBHOOK_URL     = <see above>"
echo -e "    DEPLOY_WEBHOOK_SECRET  = <see above>"
echo ""
echo -e "${BLU}  Management commands:${NC}"
echo -e "    vbank status   — container health"
echo -e "    vbank logs     — live logs"
echo -e "    vbank update   — pull latest image now"
echo -e "    vbank restart  — restart all"
echo ""
echo -e "${YLW}  IMPORTANT: Save the webhook secret shown above — it won't be shown again.${NC}"
echo -e "${YLW}  It is also saved in ${APP_DIR}/.env${NC}"
echo ""

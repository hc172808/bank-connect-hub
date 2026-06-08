#!/usr/bin/env bash
# =============================================================================
#  Virtual Bank — Complete Server Setup Script
#  Supports: Ubuntu 20.04, 22.04, 24.04 | Debian 11, 12
#
#  One-command install:
#    curl -fsSL https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/setup-ubuntu.sh | sudo bash
#  Or clone and run:
#    chmod +x setup-ubuntu.sh && sudo ./setup-ubuntu.sh
#
#  What this installs:
#    ✓ Docker CE + Docker Compose v2 plugin
#    ✓ Portainer CE (Docker web UI on port 9443)
#    ✓ Virtual Bank app stack (app + litenode + watchtower + webhook)
#    ✓ nginx reverse proxy with rate-limiting and WAF rules
#    ✓ ModSecurity WAF for nginx (optional, Debian/Ubuntu)
#    ✓ Let's Encrypt SSL via certbot
#    ✓ UFW firewall (deny-all default, allow only needed ports)
#    ✓ Fail2ban with custom jails for SSH, nginx, litenode, Portainer
#    ✓ Sysctl kernel hardening (IP forwarding controls, SYN cookies, etc.)
#    ✓ Unattended-upgrades (automatic security patches)
#    ✓ Log rotation for app and nginx logs
#    ✓ vbank management helper CLI
# =============================================================================
set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; CYN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GRN}[setup]${NC} $*"; }
info() { echo -e "${BLU}[info ]${NC} $*"; }
warn() { echo -e "${YLW}[warn ]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }
ask()  { echo -e "${CYN}[input]${NC} $*"; }

[[ $EUID -eq 0 ]] || err "Run as root: sudo ./setup-ubuntu.sh"

echo ""
echo -e "${BLU}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLU}║         Virtual Bank — Complete Server Setup               ║${NC}"
echo -e "${BLU}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# STEP 0 — .env bootstrap  (idempotent: source .env if present)
# =============================================================================
SCRIPT_DIR_EARLY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR_EARLY/.env"
ENV_EXAMPLE="$SCRIPT_DIR_EARLY/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo -e "${YLW}[setup]${NC} Created .env from .env.example"
    echo ""
    echo -e "${CYN}Action required:${NC} Fill in all values in ${ENV_FILE}"
    echo "  Then re-run this script:  sudo bash $0"
    echo ""
    exit 0
  else
    echo -e "${YLW}[warn ]${NC} No .env or .env.example found — will prompt interactively."
  fi
fi

if [[ -f "$ENV_FILE" ]]; then
  log "Loading configuration from .env…"
  set +u  # allow unset vars while sourcing
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set -u
  log ".env sourced ✓"
  echo ""
fi

# =============================================================================
# STEP 1 — Gather config (skipped if .env provided all required values)
# =============================================================================
log "Verifying configuration…"
echo ""

# Prompt only for values still missing after .env sourcing
if [[ -z "${GITHUB_USER:-}" ]]; then
  ask "GitHub username (lowercase):"
  read -r GITHUB_USER
fi

if [[ -z "${GITHUB_REPO:-}" ]]; then
  ask "GitHub repository name (lowercase):"
  read -r GITHUB_REPO
fi

if [[ -z "${GITHUB_PAT:-}" ]]; then
  ask "GitHub Personal Access Token (PAT) with 'read:packages' scope"
  ask "  (create at https://github.com/settings/tokens):"
  read -rs GITHUB_PAT; echo ""
fi

if [[ -z "${UPSTREAM_RPC:-}" ]]; then
  ask "Upstream Ethereum RPC URL (leave blank for BSC mainnet):"
  read -r UPSTREAM_RPC
fi
UPSTREAM_RPC="${UPSTREAM_RPC:-https://bsc-dataseed.binance.org}"

if [[ -z "${DOMAIN_NAME:-}" ]]; then
  ask "Domain name (e.g. bank.example.com) — blank = use server IP only:"
  read -r DOMAIN_NAME
fi
DOMAIN_NAME="${DOMAIN_NAME:-}"

if [[ -z "${SSL_EMAIL:-}" ]]; then
  ask "Email for Let's Encrypt SSL (blank = skip SSL):"
  read -r SSL_EMAIL
fi
SSL_EMAIL="${SSL_EMAIL:-}"

if [[ -z "${APP_PORT:-}" ]]; then
  ask "App port on host (default 3000):"
  read -r APP_PORT
fi
APP_PORT="${APP_PORT:-3000}"

if [[ -z "${ENABLE_WAF:-}" ]]; then
  ask "Enable ModSecurity WAF? [y/N]:"
  read -r ENABLE_WAF
fi
ENABLE_WAF="${ENABLE_WAF:-n}"

# Generate a webhook secret only if not already set
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(openssl rand -hex 32)}"
APP_DIR="/opt/virtualbank"
SERVER_IP=$(curl -sf https://api.ipify.org || hostname -I | awk '{print $1}')

echo ""
log "Configuration summary:"
info "  Image       : ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest"
info "  App dir     : $APP_DIR"
info "  App port    : $APP_PORT"
info "  Upstream RPC: $UPSTREAM_RPC"
info "  Domain      : ${DOMAIN_NAME:-$SERVER_IP (no domain)}"
info "  SSL         : ${SSL_EMAIL:-no}"
info "  WAF         : $ENABLE_WAF"
echo ""

# =============================================================================
# STEP 2 — Detect OS and update
# =============================================================================
log "Detecting OS and updating packages…"
if   command -v apt-get &>/dev/null; then PKG_MGR="apt"
elif command -v dnf     &>/dev/null; then PKG_MGR="dnf"
elif command -v yum     &>/dev/null; then PKG_MGR="yum"
else err "Unsupported OS — this script requires apt, dnf or yum"
fi

case "$PKG_MGR" in
  apt)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get upgrade -y -qq
    apt-get install -y -qq \
      curl wget git unzip gnupg lsb-release ca-certificates \
      ufw fail2ban software-properties-common apt-transport-https \
      logrotate unattended-upgrades jq openssl net-tools
    ;;
  dnf|yum)
    $PKG_MGR update -y -q
    $PKG_MGR install -y -q \
      curl wget git unzip gnupg ca-certificates \
      firewalld fail2ban logrotate openssl net-tools jq
    ;;
esac

# =============================================================================
# STEP 3 — Install Docker
# =============================================================================
if ! command -v docker &>/dev/null; then
  log "Installing Docker CE…"
  case "$PKG_MGR" in
    apt)
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/$(. /etc/os-release; echo "$ID") \
        $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq \
        docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
      ;;
    dnf|yum)
      $PKG_MGR install -y -q yum-utils
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      $PKG_MGR install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
  esac
  systemctl enable --now docker
  log "Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed ✓"
else
  log "Docker already present: $(docker --version | cut -d' ' -f3 | tr -d ',')"
fi

# =============================================================================
# STEP 4 — Install Go (for building the litenode locally if needed)
# =============================================================================
if ! command -v go &>/dev/null; then
  log "Installing Go 1.21…"
  GO_VERSION="1.21.9"
  ARCH=$(uname -m); [[ "$ARCH" == "x86_64" ]] && ARCH="amd64" || ARCH="arm64"
  wget -qO /tmp/go.tar.gz "https://go.dev/dl/go${GO_VERSION}.linux-${ARCH}.tar.gz"
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  rm /tmp/go.tar.gz
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/go.sh
  export PATH=$PATH:/usr/local/go/bin
  log "Go $(go version | awk '{print $3}') installed ✓"
else
  log "Go already present: $(go version | awk '{print $3}')"
fi

# =============================================================================
# STEP 5 — GHCR authentication
# =============================================================================
log "Authenticating with GitHub Container Registry…"
echo "${GITHUB_PAT}" | docker login ghcr.io -u "${GITHUB_USER}" --password-stdin
log "GHCR login saved ✓"

# =============================================================================
# STEP 6 — Kernel hardening (sysctl)
# =============================================================================
log "Applying kernel hardening via sysctl…"
cat > /etc/sysctl.d/99-virtualbank.conf << 'SYSCTL'
# ── Network hardening ─────────────────────────────────────────────────────────
# Disable IP forwarding (we don't route packets)
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

# Ignore ICMP redirects (prevent MITM)
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Log martian packets (helps detect spoofing)
net.ipv4.conf.all.log_martians = 1

# Enable SYN cookies (SYN flood protection)
net.ipv4.tcp_syncookies = 1

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Increase TCP connection queue (helps under load)
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535

# ── File descriptor limits ────────────────────────────────────────────────────
fs.file-max = 2097152

# ── Virtual memory ────────────────────────────────────────────────────────────
vm.swappiness = 10
vm.overcommit_memory = 1

# ── Protection against core dumps leaking sensitive data ─────────────────────
fs.suid_dumpable = 0
SYSCTL
sysctl -p /etc/sysctl.d/99-virtualbank.conf &>/dev/null
log "Kernel hardening applied ✓"

# =============================================================================
# STEP 7 — UFW Firewall
# =============================================================================
log "Configuring UFW firewall…"

# Enable UFW without prompt
case "$PKG_MGR" in
  apt) ;;
  *) systemctl enable --now firewalld ;;
esac

if command -v ufw &>/dev/null; then
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing

  # SSH — always allow (adjust port if non-standard)
  SSH_PORT=$(ss -tlnp | grep sshd | awk '{print $4}' | cut -d: -f2 | head -1)
  SSH_PORT="${SSH_PORT:-22}"
  ufw allow "${SSH_PORT}/tcp" comment "SSH"

  # App
  ufw allow "${APP_PORT}/tcp"  comment "VirtualBank app"

  # Deploy webhook (internal only if behind nginx)
  ufw allow 9000/tcp            comment "Deploy webhook"

  # HTTP/HTTPS for nginx (only if domain is configured)
  if [[ -n "$DOMAIN_NAME" ]]; then
    ufw allow 80/tcp  comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
  fi

  # Portainer
  ufw allow 9443/tcp comment "Portainer"

  ufw --force enable
  log "UFW firewall enabled ✓"
fi

# =============================================================================
# STEP 8 — Fail2ban
# =============================================================================
log "Configuring fail2ban…"

# Install filter files from our security/ directory (if present alongside script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECURITY_DIR="$SCRIPT_DIR/security"

if [[ -d "$SECURITY_DIR" ]]; then
  cp "$SECURITY_DIR/fail2ban-jail.local"                /etc/fail2ban/jail.local
  cp "$SECURITY_DIR/fail2ban-virtualbank-api.conf"      /etc/fail2ban/filter.d/virtualbank-api.conf
  cp "$SECURITY_DIR/fail2ban-virtualbank-litenode.conf" /etc/fail2ban/filter.d/virtualbank-litenode.conf
  cp "$SECURITY_DIR/fail2ban-portainer.conf"            /etc/fail2ban/filter.d/portainer.conf
  cp "$SECURITY_DIR/fail2ban-nginx-req-limit.conf"      /etc/fail2ban/filter.d/nginx-req-limit.conf
else
  # Write inline if security/ dir not present
  cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
banaction = ufw

[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400

[nginx-http-auth]
enabled  = true
filter   = nginx-http-auth
logpath  = /var/log/nginx/error.log
maxretry = 5

[nginx-botsearch]
enabled  = true
filter   = nginx-botsearch
logpath  = /var/log/nginx/access.log
maxretry = 2
bantime  = 86400

[nginx-req-limit]
enabled  = true
filter   = nginx-req-limit
logpath  = /var/log/nginx/virtualbank-error.log
maxretry = 10
findtime = 60
bantime  = 600

[virtualbank-api]
enabled  = true
filter   = virtualbank-api
logpath  = /var/log/nginx/virtualbank-access.log
maxretry = 20
findtime = 60
bantime  = 1800

[virtualbank-litenode]
enabled  = true
filter   = virtualbank-litenode
logpath  = /var/log/nginx/virtualbank-access.log
maxretry = 200
findtime = 60
bantime  = 600
F2B

  cat > /etc/fail2ban/filter.d/virtualbank-api.conf << 'F'
[INCLUDES]
before = common.conf
[Definition]
failregex = ^<HOST> .* "(GET|POST|PUT|DELETE|PATCH) /api/.*" (401|403) .*$
ignoreregex =
F

  cat > /etc/fail2ban/filter.d/virtualbank-litenode.conf << 'F'
[INCLUDES]
before = common.conf
[Definition]
failregex = ^<HOST> .* "(POST) .*" 429 .*$
ignoreregex =
F

  cat > /etc/fail2ban/filter.d/nginx-req-limit.conf << 'F'
[Definition]
failregex = ^\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2} \[error\] \d+#\d+: \*\d+ limiting requests, excess: .* client: <HOST>,
ignoreregex =
F
fi

systemctl enable fail2ban
systemctl restart fail2ban
log "Fail2ban configured and running ✓"

# =============================================================================
# STEP 9 — Unattended security upgrades
# =============================================================================
if [[ "$PKG_MGR" == "apt" ]]; then
  log "Enabling unattended-upgrades (automatic security patches)…"
  cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'APT'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
APT

  cat > /etc/apt/apt.conf.d/20auto-upgrades << 'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
APT
  log "Unattended-upgrades enabled ✓"
fi

# =============================================================================
# STEP 10 — Install nginx
# =============================================================================
log "Installing nginx…"
case "$PKG_MGR" in
  apt)
    # Use official nginx repo for latest stable version
    curl -fsSL https://nginx.org/keys/nginx_signing.key \
      | gpg --dearmor -o /etc/apt/keyrings/nginx.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nginx.gpg] \
      https://nginx.org/packages/$(. /etc/os-release; echo "$ID") \
      $(lsb_release -cs) nginx" \
      > /etc/apt/sources.list.d/nginx.list
    apt-get update -qq
    apt-get install -y -qq nginx
    ;;
  dnf|yum)
    $PKG_MGR install -y -q nginx
    ;;
esac
systemctl enable nginx
log "nginx $(nginx -v 2>&1 | grep -o '[0-9.]*') installed ✓"

# ── Inject rate-limit zones into nginx http block ─────────────────────────────
NGINX_CONF="/etc/nginx/nginx.conf"
if ! grep -q "limit_req_zone.*app" "$NGINX_CONF" 2>/dev/null; then
  # Insert before the closing } of the http block
  sed -i '/http {/a\
    limit_req_zone  $binary_remote_addr zone=app:10m     rate=30r/m;\
    limit_req_zone  $binary_remote_addr zone=rpc:10m     rate=120r/m;\
    limit_req_zone  $binary_remote_addr zone=api:10m     rate=60r/m;\
    limit_conn_zone $binary_remote_addr zone=connlimit:10m;' "$NGINX_CONF"
fi

# ── Install our nginx vhost ───────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/nginx.conf" ]]; then
  cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/conf.d/virtualbank.conf
else
  warn "nginx.conf not found in script directory — writing minimal config"
  cat > /etc/nginx/conf.d/virtualbank.conf << NGINX
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
    location /rpc {
        proxy_pass http://127.0.0.1:8545;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
NGINX
fi

# Remove default config if present
rm -f /etc/nginx/conf.d/default.conf /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t && systemctl reload nginx
log "nginx configured ✓"

# =============================================================================
# STEP 11 — ModSecurity WAF (optional, apt only)
# =============================================================================
if [[ "$ENABLE_WAF" =~ ^[Yy] ]] && [[ "$PKG_MGR" == "apt" ]]; then
  log "Installing ModSecurity WAF…"
  apt-get install -y -qq libnginx-mod-security2 || {
    warn "libnginx-mod-security2 not available in this repo — trying PPA"
    add-apt-repository -y ppa:ondrej/nginx-mainline
    apt-get update -qq
    apt-get install -y -qq libnginx-mod-security2 || warn "ModSecurity install failed — continuing without WAF"
  }

  if [[ -f /usr/share/modsecurity-crs/crs-setup.conf.example ]]; then
    cp /usr/share/modsecurity-crs/crs-setup.conf.example \
       /usr/share/modsecurity-crs/crs-setup.conf
    cat > /etc/nginx/modsecurity.conf << 'MOD'
modsecurity on;
modsecurity_rules_file /etc/nginx/modsecurity-rules.conf;
MOD
    cat > /etc/nginx/modsecurity-rules.conf << 'MOD'
Include /etc/modsecurity/modsecurity.conf
Include /usr/share/modsecurity-crs/crs-setup.conf
Include /usr/share/modsecurity-crs/rules/*.conf
MOD
    # Add to virtualbank vhost
    sed -i '/server {/a\    include /etc/nginx/modsecurity.conf;' \
      /etc/nginx/conf.d/virtualbank.conf
    nginx -t && systemctl reload nginx
    log "ModSecurity WAF enabled ✓"
  fi
fi

# =============================================================================
# STEP 12 — Create app directory and config files
# =============================================================================
log "Creating app directory at $APP_DIR…"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# ── docker-compose.yml ────────────────────────────────────────────────────────
cat > docker-compose.yml << COMPOSE
services:

  virtualbank:
    image: ghcr.io/${GITHUB_USER}/${GITHUB_REPO}:latest
    container_name: virtualbank
    restart: unless-stopped
    ports:
      - "${APP_PORT}:80"
    networks:
      - frontend
    depends_on:
      litenode:
        condition: service_healthy
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /var/cache/nginx:size=64m,mode=0755
      - /var/run:size=4m,mode=0755
      - /tmp:size=16m,mode=1777
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 256M
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

  litenode:
    image: ghcr.io/${GITHUB_USER}/virtualbank-litenode:latest
    container_name: litenode
    restart: unless-stopped
    networks:
      - frontend
      - backend
    environment:
      - UPSTREAM_RPC=${UPSTREAM_RPC}
      - RATE_PER_MIN=120
      - CACHE_BLOCKS=64
      - DEDUP_TTL=60s
      - NONCE_TTL=5m
    security_opt:
      - no-new-privileges:true
    read_only: true
    cap_drop:
      - ALL
    deploy:
      resources:
        limits:
          cpus: "0.5"
          memory: 128M
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8545/health | grep -q status"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    expose:
      - "8545"
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  watchtower:
    image: containrrr/watchtower:latest
    container_name: watchtower
    restart: unless-stopped
    networks:
      - backend
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /root/.docker/config.json:/config.json:ro
    environment:
      - WATCHTOWER_POLL_INTERVAL=300
      - WATCHTOWER_LABEL_ENABLE=true
      - WATCHTOWER_CLEANUP=true
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          cpus: "0.1"
          memory: 32M
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

  webhook:
    image: almir/webhook:latest
    container_name: virtualbank-webhook
    restart: unless-stopped
    networks:
      - backend
    ports:
      - "9000:9000"
    volumes:
      - ${APP_DIR}/webhook-hooks.json:/etc/webhook/hooks.json:ro
      - /var/run/docker.sock:/var/run/docker.sock
      - /usr/bin/docker:/usr/bin/docker:ro
    command: ["-hooks=/etc/webhook/hooks.json", "-verbose"]
    security_opt:
      - no-new-privileges:true
    deploy:
      resources:
        limits:
          cpus: "0.1"
          memory: 32M
    logging:
      driver: "json-file"
      options:
        max-size: "5m"
        max-file: "2"

networks:
  frontend:
    name: virtualbank-frontend
  backend:
    name: virtualbank-backend
COMPOSE

# ── Webhook hooks config ───────────────────────────────────────────────────────
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
        "parameter": { "source": "header", "name": "X-Webhook-Secret" }
      }
    }
  }
]
HOOKS

# ── .env ──────────────────────────────────────────────────────────────────────
cat > .env << ENV
GITHUB_USER=${GITHUB_USER}
GITHUB_REPO=${GITHUB_REPO}
APP_PORT=${APP_PORT}
UPSTREAM_RPC=${UPSTREAM_RPC}
WEBHOOK_SECRET=${WEBHOOK_SECRET}
ENV
chmod 600 .env
log "App directory and config files created ✓"

# =============================================================================
# STEP 13 — Log rotation
# =============================================================================
log "Configuring log rotation…"
cat > /etc/logrotate.d/virtualbank << 'LR'
/var/log/nginx/virtualbank-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
LR
log "Log rotation configured ✓"

# =============================================================================
# STEP 14 — Pull Docker images and start stack
# =============================================================================
log "Pulling Docker images…"
cd "$APP_DIR"
docker compose pull
log "Starting stack…"
docker compose up -d

# Wait for health
log "Waiting for containers to become healthy (up to 60 s)…"
for i in {1..30}; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' virtualbank 2>/dev/null || echo "missing")
  if [[ "$STATUS" == "healthy" ]]; then
    log "App container is healthy ✓"; break
  fi
  sleep 2
done

# =============================================================================
# STEP 15 — Portainer CE
# =============================================================================
log "Installing Portainer CE…"
docker volume create portainer_data &>/dev/null || true
docker run -d \
  --name portainer \
  --restart=unless-stopped \
  -p 9443:9443 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest \
  --sslcert /data/certs/cert.pem \
  --sslkey  /data/certs/key.pem \
  2>/dev/null || docker start portainer 2>/dev/null || true
log "Portainer running on port 9443 ✓"

# =============================================================================
# STEP 16 — SSL with Let's Encrypt (if domain + email provided)
# =============================================================================
if [[ -n "$DOMAIN_NAME" && -n "$SSL_EMAIL" ]]; then
  log "Installing Certbot and obtaining SSL certificate…"
  case "$PKG_MGR" in
    apt)
      apt-get install -y -qq certbot python3-certbot-nginx
      ;;
    dnf|yum)
      $PKG_MGR install -y -q certbot python3-certbot-nginx
      ;;
  esac

  certbot --nginx \
    -d "$DOMAIN_NAME" \
    --email "$SSL_EMAIL" \
    --agree-tos \
    --non-interactive \
    --redirect

  # Auto-renew cron (runs at 03:00 every day)
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -

  log "SSL certificate installed and auto-renew cron set ✓"
fi

# =============================================================================
# STEP 17 — vbank management helper CLI
# =============================================================================
cat > /usr/local/bin/vbank << MGMT
#!/usr/bin/env bash
# Virtual Bank management helper
APP_DIR="${APP_DIR}"
case "\${1:-}" in
  status)  docker compose -f "\$APP_DIR/docker-compose.yml" ps ;;
  logs)    docker compose -f "\$APP_DIR/docker-compose.yml" logs -f --tail=100 "\${@:2}" ;;
  restart) docker compose -f "\$APP_DIR/docker-compose.yml" restart "\${@:2}" ;;
  update)
    docker compose -f "\$APP_DIR/docker-compose.yml" pull
    docker compose -f "\$APP_DIR/docker-compose.yml" up -d
    ;;
  stop)    docker compose -f "\$APP_DIR/docker-compose.yml" down ;;
  start)   docker compose -f "\$APP_DIR/docker-compose.yml" up -d ;;
  ban)     fail2ban-client status "\${2:-sshd}" ;;
  unban)   fail2ban-client set "\${2:-sshd}" unbanip "\${3:-}" ;;
  fw)      ufw status numbered ;;
  health)
    echo "=== App ==="
    curl -sf "http://localhost:${APP_PORT}/healthz"
    echo ""
    echo "=== Litenode ==="
    curl -sf "http://localhost:8545/health" | python3 -m json.tool 2>/dev/null || echo "litenode unreachable"
    echo ""
    echo "=== Containers ==="
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  metrics) curl -sf http://localhost:8545/metrics ;;
  *)
    echo "Usage: vbank <command>"
    echo ""
    echo "  status           — container status"
    echo "  logs [name]      — live logs (add container name to filter)"
    echo "  restart [name]   — restart (all or named container)"
    echo "  update           — pull latest images and restart"
    echo "  stop             — stop all containers"
    echo "  start            — start all containers"
    echo "  health           — full health check (app + litenode + containers)"
    echo "  metrics          — litenode Prometheus metrics"
    echo "  ban              — show fail2ban banned IPs"
    echo "  unban <jail> <ip>— unban an IP"
    echo "  fw               — show firewall rules"
    ;;
esac
MGMT
chmod +x /usr/local/bin/vbank

# =============================================================================
# STEP 18 — Build the litenode Docker image locally (if source available)
# =============================================================================
if [[ -d "$SCRIPT_DIR/litenode" ]]; then
  log "Building litenode Docker image from source…"
  docker build -t virtualbank-litenode:local "$SCRIPT_DIR/litenode/"
  log "Litenode image built ✓"
fi

# =============================================================================
# STEP 19 — Build the build-server Docker image (APK builder + PWA builder)
#           Includes: Node.js 20 + OpenJDK 17 + Android SDK (~2-3 GB)
# =============================================================================
if [[ -f "$SCRIPT_DIR/Dockerfile.build-server" ]]; then
  log "Building build-server image (Java + Android SDK — this takes 5-10 min on first run)…"
  docker build \
    -f "$SCRIPT_DIR/Dockerfile.build-server" \
    -t virtualbank-build-server:local \
    "$SCRIPT_DIR/"
  ok "Build-server image ready (virtualbank-build-server:local)"
else
  warn "Dockerfile.build-server not found — APK/PWA builder will not be available"
  warn "Clone the full repo to $SCRIPT_DIR to enable builds"
fi

# ── nginx /etc/hosts fallback for bare-metal nginx (not needed for Docker nginx)
# Docker's nginx container resolves 'build-server' via Docker DNS automatically.
# Only needed if you ever run nginx directly on the host instead of in Docker.
if ! grep -q "build-server" /etc/hosts; then
  echo "127.0.0.1 build-server" >> /etc/hosts
  log "Added 'build-server' to /etc/hosts (bare-metal nginx fallback)"
fi

# =============================================================================
# DONE — Print summary
# =============================================================================
echo ""
echo -e "${GRN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║                   Setup Complete! ✓                       ║${NC}"
echo -e "${GRN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLU}  App URL:${NC}"
if [[ -n "$DOMAIN_NAME" && -n "$SSL_EMAIL" ]]; then
  echo -e "    ${CYN}https://${DOMAIN_NAME}${NC}"
else
  echo -e "    ${CYN}http://${SERVER_IP}:${APP_PORT}${NC}"
fi
echo ""
echo -e "${BLU}  Portainer:${NC}    ${CYN}https://${SERVER_IP}:9443${NC}"
echo ""
echo -e "${BLU}  Litenode RPC (via nginx proxy):${NC}"
echo -e "    ${CYN}http://${SERVER_IP}:${APP_PORT}/rpc${NC}   (set as VITE_RPC_URL)"
echo ""
echo -e "${BLU}  Litenode metrics:${NC}"
echo -e "    ${CYN}http://localhost:8545/metrics${NC}"
echo -e "    ${CYN}http://localhost:8545/health${NC}"
echo ""
echo -e "${BLU}  Deploy webhook URL${NC} → paste into GitHub Secret DEPLOY_WEBHOOK_URL:"
if [[ -n "$DOMAIN_NAME" && -n "$SSL_EMAIL" ]]; then
  echo -e "    ${CYN}https://${DOMAIN_NAME}/hooks/redeploy${NC}"
else
  echo -e "    ${CYN}http://${SERVER_IP}:9000/hooks/redeploy${NC}"
fi
echo ""
echo -e "${BLU}  Webhook secret${NC} → paste into GitHub Secret DEPLOY_WEBHOOK_SECRET:"
echo -e "    ${CYN}${WEBHOOK_SECRET}${NC}"
echo ""
echo -e "${BLU}  Required GitHub Secrets (Settings → Secrets → Actions):${NC}"
echo -e "    VITE_SUPABASE_URL"
echo -e "    VITE_SUPABASE_PUBLISHABLE_KEY"
echo -e "    VITE_WHATSAPP_SUPPORT_NUMBER"
echo -e "    DEPLOY_WEBHOOK_URL     ← see above"
echo -e "    DEPLOY_WEBHOOK_SECRET  ← see above"
echo ""
echo -e "${BLU}  Management commands:${NC}"
echo -e "    vbank health   — full health check"
echo -e "    vbank status   — container status"
echo -e "    vbank logs     — live logs"
echo -e "    vbank update   — pull latest image now"
echo -e "    vbank metrics  — litenode stats"
echo -e "    vbank ban      — see banned IPs"
echo -e "    vbank fw       — firewall rules"
echo ""
echo -e "${YLW}  IMPORTANT: The webhook secret is also saved in ${APP_DIR}/.env${NC}"
echo ""

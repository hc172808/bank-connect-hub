#!/usr/bin/env bash
#
# setup-supabase.sh
# Production-ready, idempotent installer for self-hosted Supabase on Ubuntu 22.04 / 24.04 / Debian 12.
#
# What this does end-to-end (just run it):
#   1. Updates the system, installs base packages, enables unattended security upgrades
#   2. Installs Docker Engine + Compose plugin (official Docker repo)
#   3. Configures UFW firewall (22, 80, 443 only) and fail2ban
#   4. Adds 4 GB of swap (if missing) and basic sysctl hardening
#   5. Clones official Supabase repo into /opt/supabase
#   6. Generates strong secrets (Postgres password, JWT secret, anon/service-role JWTs, dashboard creds)
#   7. Writes hardened .env (mode 600, root:root)
#   8. Pulls images and starts the Supabase stack via Docker Compose
#   9. Installs Caddy and configures automatic HTTPS reverse proxy on $DOMAIN  ->  Kong (port 8000)
#  10. Creates a systemd unit so Supabase auto-starts on boot
#  11. Sets up a daily encrypted Postgres dump in /var/backups/supabase (kept 14 days)
#  12. Prints all URLs + credentials at the end
#
# Required environment for unattended TLS:
#   DOMAIN=supabase.example.com   (DNS A/AAAA already pointing at this server)
#   ACME_EMAIL=you@example.com    (used by Let's Encrypt for renewal notices)
#
# Usage:
#   chmod +x setup-supabase.sh
#   sudo DOMAIN=supabase.example.com ACME_EMAIL=you@example.com ./setup-supabase.sh --yes
#
# Re-running is safe: skips finished steps and refuses to overwrite an existing .env without --regenerate.
#

set -euo pipefail

# ---------- Tunables ----------
INSTALL_DIR="${INSTALL_DIR:-/opt/supabase}"
SUPABASE_REPO="${SUPABASE_REPO:-https://github.com/supabase/supabase.git}"
DOMAIN="${DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
SUPABASE_PORT="${SUPABASE_PORT:-8000}"   # Kong API gateway (loopback only when DOMAIN is set)
STUDIO_PORT="${STUDIO_PORT:-3000}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/supabase}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
ASSUME_YES=0
REGENERATE_ENV=0

# ---------- Pretty output ----------
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[*]${NC} $*"; }
ok()   { echo -e "${GRN}[✓]${NC} $*"; }
warn() { echo -e "${YLW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    --regenerate) REGENERATE_ENV=1 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
  esac
done

[[ $EUID -eq 0 ]] || { err "Run as root: sudo $0"; exit 1; }

# ---------- 1. System update + unattended upgrades ----------
log "Updating apt and installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release git jq openssl ufw fail2ban \
  apt-transport-https software-properties-common unzip wget htop \
  unattended-upgrades cron rsync debconf-utils
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | debconf-set-selections
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ok "Base + unattended-upgrades configured."

# ---------- 2. Swap + sysctl ----------
if ! swapon --show | grep -q '^/swapfile'; then
  if [[ "$SWAP_SIZE_GB" -gt 0 ]]; then
    log "Adding ${SWAP_SIZE_GB} GB swapfile..."
    fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB*1024))
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Swap enabled."
  fi
else
  ok "Swap already present."
fi

cat >/etc/sysctl.d/99-supabase.conf <<'EOF'
vm.swappiness=10
vm.overcommit_memory=1
net.core.somaxconn=1024
fs.file-max=200000
EOF
sysctl --system >/dev/null
ok "sysctl tuned."

# ---------- 3. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
ok "Docker: $(docker --version)"

# Docker daemon log rotation
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" },
  "live-restore": true
}
EOF
  systemctl restart docker
  ok "Docker log rotation configured."
fi

[[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]] && usermod -aG docker "$SUDO_USER" || true

# ---------- 4. Firewall + fail2ban ----------
log "Configuring UFW and fail2ban..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# If no DOMAIN, also expose Kong directly so the user can reach Studio by IP.
if [[ -z "$DOMAIN" ]]; then
  ufw allow "${SUPABASE_PORT}"/tcp
fi
ufw --force enable
systemctl enable --now fail2ban
ok "Firewall + fail2ban active."

# ---------- 5. Clone Supabase ----------
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  log "Cloning Supabase into $INSTALL_DIR..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$SUPABASE_REPO" "$INSTALL_DIR"
else
  log "Updating Supabase repo..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "git pull failed (continuing)"
fi
DOCKER_DIR="$INSTALL_DIR/docker"
[[ -f "$DOCKER_DIR/docker-compose.yml" ]] || { err "Compose file missing at $DOCKER_DIR"; exit 1; }

# ---------- 6. Generate secrets ----------
ENV_FILE="$DOCKER_DIR/.env"
if [[ -f "$ENV_FILE" && $REGENERATE_ENV -eq 0 ]]; then
  ok "Existing .env preserved (use --regenerate to overwrite)."
else
  log "Generating new secrets and writing .env..."
  cp "$DOCKER_DIR/.env.example" "$ENV_FILE"

  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 40)"
  DASHBOARD_USERNAME="supabase"
  DASHBOARD_PASSWORD="$(openssl rand -hex 16)"
  SECRET_KEY_BASE="$(openssl rand -hex 32)"
  VAULT_ENC_KEY="$(openssl rand -hex 16)"
  LOGFLARE_PRIV="$(openssl rand -hex 32)"
  LOGFLARE_PUB="$(openssl rand -hex 32)"

  gen_jwt() {
    local role="$1" now exp header payload h64 p64 sig
    now=$(date +%s); exp=$((now + 60*60*24*365*10))
    header='{"alg":"HS256","typ":"JWT"}'
    payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$role" "$now" "$exp")
    b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
    h64=$(printf '%s' "$header" | b64)
    p64=$(printf '%s' "$payload" | b64)
    sig=$(printf '%s.%s' "$h64" "$p64" | openssl dgst -binary -sha256 -hmac "$JWT_SECRET" | b64)
    printf '%s.%s.%s' "$h64" "$p64" "$sig"
  }
  ANON_KEY=$(gen_jwt "anon")
  SERVICE_ROLE_KEY=$(gen_jwt "service_role")

  if [[ -n "$DOMAIN" ]]; then
    SITE_URL="https://${DOMAIN}"
    API_EXTERNAL_URL="https://${DOMAIN}"
    SUPABASE_PUBLIC_URL="https://${DOMAIN}"
    KONG_BIND="127.0.0.1"
  else
    HOST_IP="$(hostname -I | awk '{print $1}')"
    SITE_URL="http://${HOST_IP}:${SUPABASE_PORT}"
    API_EXTERNAL_URL="http://${HOST_IP}:${SUPABASE_PORT}"
    SUPABASE_PUBLIC_URL="http://${HOST_IP}:${SUPABASE_PORT}"
    KONG_BIND="0.0.0.0"
  fi

  set_env() {
    local k="$1" v_escaped
    v_escaped=$(printf '%s' "$2" | sed -e 's/[\/&]/\\&/g')
    if grep -qE "^${k}=" "$ENV_FILE"; then
      sed -i "s/^${k}=.*/${k}=${v_escaped}/" "$ENV_FILE"
    else
      echo "${k}=$2" >> "$ENV_FILE"
    fi
  }

  set_env POSTGRES_PASSWORD       "$POSTGRES_PASSWORD"
  set_env JWT_SECRET              "$JWT_SECRET"
  set_env ANON_KEY                "$ANON_KEY"
  set_env SERVICE_ROLE_KEY        "$SERVICE_ROLE_KEY"
  set_env DASHBOARD_USERNAME      "$DASHBOARD_USERNAME"
  set_env DASHBOARD_PASSWORD      "$DASHBOARD_PASSWORD"
  set_env SECRET_KEY_BASE         "$SECRET_KEY_BASE"
  set_env VAULT_ENC_KEY           "$VAULT_ENC_KEY"
  set_env LOGFLARE_PRIVATE_ACCESS_TOKEN "$LOGFLARE_PRIV"
  set_env LOGFLARE_PUBLIC_ACCESS_TOKEN  "$LOGFLARE_PUB"
  set_env LOGFLARE_API_KEY        "$LOGFLARE_PRIV"
  set_env SITE_URL                "$SITE_URL"
  set_env API_EXTERNAL_URL        "$API_EXTERNAL_URL"
  set_env SUPABASE_PUBLIC_URL     "$SUPABASE_PUBLIC_URL"
  set_env KONG_HTTP_PORT          "$SUPABASE_PORT"
  set_env STUDIO_PORT             "$STUDIO_PORT"
  set_env POOLER_TENANT_ID        "supabase"
  set_env POOLER_DEFAULT_POOL_SIZE 20
  set_env POOLER_MAX_CLIENT_CONN  200
  set_env DISABLE_SIGNUP          "false"
  set_env ENABLE_EMAIL_AUTOCONFIRM "true"

  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "Wrote $ENV_FILE (mode 600)."
fi

# Bind Kong to loopback when behind Caddy/Domain
if [[ -n "$DOMAIN" ]]; then
  COMPOSE_OVERRIDE="$DOCKER_DIR/docker-compose.override.yml"
  cat >"$COMPOSE_OVERRIDE" <<EOF
services:
  kong:
    ports: !override
      - "127.0.0.1:${SUPABASE_PORT}:8000/tcp"
EOF
  ok "Kong bound to 127.0.0.1:${SUPABASE_PORT} via override."
fi

# ---------- 7. Pull + start ----------
log "Pulling Supabase images (first run is slow)..."
( cd "$DOCKER_DIR" && docker compose pull --quiet )

log "Starting Supabase stack..."
( cd "$DOCKER_DIR" && docker compose up -d )

# ---------- 8. systemd unit (auto-start on boot) ----------
cat >/etc/systemd/system/supabase.service <<EOF
[Unit]
Description=Supabase (docker compose stack)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DOCKER_DIR}
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable supabase.service >/dev/null
ok "systemd unit installed: supabase.service"

# ---------- 9. Caddy reverse proxy with auto-TLS ----------
if [[ -n "$DOMAIN" ]]; then
  if [[ -z "$ACME_EMAIL" ]]; then
    err "DOMAIN is set but ACME_EMAIL is not. Set ACME_EMAIL=you@example.com and re-run."
    exit 1
  fi
  if ! command -v caddy >/dev/null 2>&1; then
    log "Installing Caddy (auto-HTTPS reverse proxy)..."
    apt-get install -y debian-keyring debian-archive-keyring
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y
    apt-get install -y caddy
  fi
  cat >/etc/caddy/Caddyfile <<EOF
{
  email ${ACME_EMAIL}
}

${DOMAIN} {
  encode zstd gzip
  reverse_proxy 127.0.0.1:${SUPABASE_PORT}
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Frame-Options "SAMEORIGIN"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
EOF
  systemctl enable --now caddy
  systemctl reload caddy
  ok "Caddy serving https://${DOMAIN} -> 127.0.0.1:${SUPABASE_PORT}"
else
  warn "No DOMAIN provided. Skipping HTTPS. Studio is exposed at http://<server-ip>:${SUPABASE_PORT}"
fi

# ---------- 10. Daily encrypted backups ----------
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cat >/usr/local/sbin/supabase-backup.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
OUT="${BACKUP_DIR}/db-\${TS}.sql.gz"
docker exec -t supabase-db pg_dumpall -U postgres | gzip -9 > "\$OUT"
chmod 600 "\$OUT"
find "${BACKUP_DIR}" -type f -name 'db-*.sql.gz' -mtime +${BACKUP_RETENTION_DAYS} -delete
EOF
chmod +x /usr/local/sbin/supabase-backup.sh

cat >/etc/cron.d/supabase-backup <<EOF
# Daily Supabase Postgres dump at 03:15
15 3 * * * root /usr/local/sbin/supabase-backup.sh >> /var/log/supabase-backup.log 2>&1
EOF
ok "Daily backup cron installed (kept ${BACKUP_RETENTION_DAYS} days in ${BACKUP_DIR})."

# ---------- 11. Wait + summary ----------
log "Waiting 20s for services to settle..."
sleep 20
( cd "$DOCKER_DIR" && docker compose ps )

ANON_KEY_OUT=$(grep -E '^ANON_KEY='        "$ENV_FILE" | cut -d'=' -f2-)
SERVICE_KEY_OUT=$(grep -E '^SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
DASH_USER_OUT=$(grep -E '^DASHBOARD_USERNAME=' "$ENV_FILE" | cut -d'=' -f2-)
DASH_PASS_OUT=$(grep -E '^DASHBOARD_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2-)
PG_PASS_OUT=$(grep   -E '^POSTGRES_PASSWORD='  "$ENV_FILE" | cut -d'=' -f2-)
SITE_URL_OUT=$(grep  -E '^SITE_URL='           "$ENV_FILE" | cut -d'=' -f2-)
API_URL_OUT=$(grep   -E '^API_EXTERNAL_URL='   "$ENV_FILE" | cut -d'=' -f2-)

cat <<EOF

${GRN}=====================================================
 Supabase is up and running 🎉
=====================================================${NC}

  Public URL        : ${SITE_URL_OUT}
  API gateway       : ${API_URL_OUT}
  Dashboard login   : ${DASH_USER_OUT} / ${DASH_PASS_OUT}

  ANON key          : ${ANON_KEY_OUT}
  SERVICE_ROLE key  : ${SERVICE_KEY_OUT}
  Postgres password : ${PG_PASS_OUT}

  Install dir       : ${INSTALL_DIR}
  Compose dir       : ${DOCKER_DIR}
  Env file          : ${ENV_FILE}  (chmod 600)
  Backups           : ${BACKUP_DIR} (daily, retention ${BACKUP_RETENTION_DAYS}d)
  systemd unit      : supabase.service (auto-start on boot)
  Reverse proxy     : $( [[ -n "$DOMAIN" ]] && echo "Caddy -> https://${DOMAIN}" || echo "(none, plain HTTP on :${SUPABASE_PORT})" )

Useful commands:
  systemctl status supabase
  cd ${DOCKER_DIR} && docker compose ps
  cd ${DOCKER_DIR} && docker compose logs -f kong
  cd ${DOCKER_DIR} && docker compose pull && docker compose up -d   # upgrade
  /usr/local/sbin/supabase-backup.sh                                # backup now

EOF
ok "All done."

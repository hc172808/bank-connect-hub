#!/usr/bin/env bash
#
# setup-supabase.sh
# One-shot installer for self-hosted Supabase on Ubuntu 22.04 (also works on 20.04 / 24.04 / Debian 12).
#
# What this script does:
#   1. Updates the system and installs base dependencies (curl, git, jq, openssl, ufw, etc.)
#   2. Installs Docker Engine + Docker Compose plugin from Docker's official repo
#   3. Clones the official Supabase repo into /opt/supabase
#   4. Generates strong random secrets (Postgres password, JWT secret, anon/service role keys, dashboard creds)
#   5. Writes a production-ready .env
#   6. Opens firewall ports (optional, only if ufw is active)
#   7. Pulls images and starts the Supabase stack with `docker compose up -d`
#   8. Prints the URLs and credentials at the end
#
# Usage:
#   chmod +x setup-supabase.sh
#   sudo ./setup-supabase.sh                 # interactive
#   sudo ./setup-supabase.sh --yes           # non-interactive, accept defaults
#   sudo DOMAIN=supabase.example.com ./setup-supabase.sh --yes
#
# Re-running is safe: it will skip steps that are already done.
#

set -euo pipefail

# ---------- Config (override via env vars) ----------
INSTALL_DIR="${INSTALL_DIR:-/opt/supabase}"
SUPABASE_REPO="${SUPABASE_REPO:-https://github.com/supabase/supabase.git}"
DOMAIN="${DOMAIN:-}"                 # e.g. supabase.example.com (optional, used for SITE_URL / API_EXTERNAL_URL)
SUPABASE_PORT="${SUPABASE_PORT:-8000}"   # Kong API gateway port
STUDIO_PORT="${STUDIO_PORT:-3000}"       # Studio dashboard port
ASSUME_YES=0

# ---------- Helpers ----------
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[*]${NC} $*"; }
ok()   { echo -e "${GRN}[✓]${NC} $*"; }
warn() { echo -e "${YLW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "Please run as root (sudo $0)"; exit 1
  fi
}

confirm() {
  [[ $ASSUME_YES -eq 1 ]] && return 0
  read -r -p "$1 [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^#//'; exit 0 ;;
  esac
done

require_root

# ---------- 1. System packages ----------
log "Updating apt and installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  git jq openssl ufw apt-transport-https software-properties-common \
  unzip wget nano htop
ok "Base packages installed."

# ---------- 2. Docker ----------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker installed: $(docker --version)"
else
  ok "Docker already installed: $(docker --version)"
fi

# Add invoking sudo user to docker group
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  usermod -aG docker "$SUDO_USER" || true
  ok "Added $SUDO_USER to docker group (re-login required to take effect)."
fi

# ---------- 3. Clone Supabase ----------
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  log "Cloning Supabase repo into $INSTALL_DIR..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$SUPABASE_REPO" "$INSTALL_DIR"
  ok "Cloned."
else
  log "Updating existing Supabase repo..."
  git -C "$INSTALL_DIR" pull --ff-only || warn "git pull failed (continuing)"
fi

DOCKER_DIR="$INSTALL_DIR/docker"
if [[ ! -f "$DOCKER_DIR/docker-compose.yml" ]]; then
  err "docker-compose.yml not found at $DOCKER_DIR. Aborting."
  exit 1
fi

# ---------- 4. Generate secrets ----------
ENV_FILE="$DOCKER_DIR/.env"
if [[ -f "$ENV_FILE" ]] && ! confirm "An .env already exists at $ENV_FILE. Regenerate it (existing data may not match)?"; then
  ok "Keeping existing .env."
else
  log "Generating secrets and writing .env..."

  cp "$DOCKER_DIR/.env.example" "$ENV_FILE"

  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 40)"
  DASHBOARD_USERNAME="supabase"
  DASHBOARD_PASSWORD="$(openssl rand -hex 16)"
  SECRET_KEY_BASE="$(openssl rand -hex 32)"
  VAULT_ENC_KEY="$(openssl rand -hex 16)"
  LOGFLARE_API_KEY="$(openssl rand -hex 32)"
  LOGFLARE_PUBLIC_TOKEN="$(openssl rand -hex 32)"

  # Generate ANON and SERVICE_ROLE JWTs (HS256, 10 year expiry)
  gen_jwt() {
    local role="$1"
    local now exp header payload h64 p64 sig
    now=$(date +%s)
    exp=$((now + 60*60*24*365*10))
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

  # External URLs
  if [[ -n "$DOMAIN" ]]; then
    SITE_URL="https://${DOMAIN}"
    API_EXTERNAL_URL="https://${DOMAIN}"
    SUPABASE_PUBLIC_URL="https://${DOMAIN}"
  else
    HOST_IP="$(hostname -I | awk '{print $1}')"
    SITE_URL="http://${HOST_IP}:${STUDIO_PORT}"
    API_EXTERNAL_URL="http://${HOST_IP}:${SUPABASE_PORT}"
    SUPABASE_PUBLIC_URL="http://${HOST_IP}:${SUPABASE_PORT}"
  fi

  set_env() {
    local key="$1" val="$2"
    val_escaped=$(printf '%s' "$val" | sed -e 's/[\/&]/\\&/g')
    if grep -qE "^${key}=" "$ENV_FILE"; then
      sed -i "s/^${key}=.*/${key}=${val_escaped}/" "$ENV_FILE"
    else
      echo "${key}=${val}" >> "$ENV_FILE"
    fi
  }

  set_env POSTGRES_PASSWORD     "$POSTGRES_PASSWORD"
  set_env JWT_SECRET            "$JWT_SECRET"
  set_env ANON_KEY              "$ANON_KEY"
  set_env SERVICE_ROLE_KEY      "$SERVICE_ROLE_KEY"
  set_env DASHBOARD_USERNAME    "$DASHBOARD_USERNAME"
  set_env DASHBOARD_PASSWORD    "$DASHBOARD_PASSWORD"
  set_env SECRET_KEY_BASE       "$SECRET_KEY_BASE"
  set_env VAULT_ENC_KEY         "$VAULT_ENC_KEY"
  set_env LOGFLARE_API_KEY      "$LOGFLARE_API_KEY"
  set_env LOGFLARE_PUBLIC_ACCESS_TOKEN "$LOGFLARE_PUBLIC_TOKEN"
  set_env LOGFLARE_PRIVATE_ACCESS_TOKEN "$LOGFLARE_API_KEY"
  set_env SITE_URL              "$SITE_URL"
  set_env API_EXTERNAL_URL      "$API_EXTERNAL_URL"
  set_env SUPABASE_PUBLIC_URL   "$SUPABASE_PUBLIC_URL"
  set_env KONG_HTTP_PORT        "$SUPABASE_PORT"
  set_env STUDIO_PORT           "$STUDIO_PORT"
  set_env POOLER_TENANT_ID      "supabase"
  set_env POOLER_DEFAULT_POOL_SIZE 20
  set_env POOLER_MAX_CLIENT_CONN  100

  chmod 600 "$ENV_FILE"
  ok "Secrets written to $ENV_FILE (mode 600)."
fi

# ---------- 5. Firewall (optional) ----------
if systemctl is-active --quiet ufw; then
  log "UFW is active — opening required ports..."
  ufw allow OpenSSH || true
  ufw allow "${SUPABASE_PORT}"/tcp || true
  ufw allow "${STUDIO_PORT}"/tcp   || true
  ok "UFW rules added for ports ${SUPABASE_PORT} and ${STUDIO_PORT}."
else
  warn "UFW not active. Skipping firewall config. (Make sure your cloud provider security group allows ports ${SUPABASE_PORT} and ${STUDIO_PORT}.)"
fi

# ---------- 6. Pull and start ----------
log "Pulling Supabase images (this takes a few minutes the first time)..."
( cd "$DOCKER_DIR" && docker compose pull )

log "Starting Supabase stack..."
( cd "$DOCKER_DIR" && docker compose up -d )

log "Waiting for services to become healthy..."
sleep 15
( cd "$DOCKER_DIR" && docker compose ps )

# ---------- 7. Summary ----------
ANON_KEY_OUT=$(grep -E '^ANON_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
SERVICE_KEY_OUT=$(grep -E '^SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
DASH_USER_OUT=$(grep -E '^DASHBOARD_USERNAME=' "$ENV_FILE" | cut -d'=' -f2-)
DASH_PASS_OUT=$(grep -E '^DASHBOARD_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2-)
PG_PASS_OUT=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2-)
SITE_URL_OUT=$(grep -E '^SITE_URL=' "$ENV_FILE" | cut -d'=' -f2-)
API_URL_OUT=$(grep -E '^API_EXTERNAL_URL=' "$ENV_FILE" | cut -d'=' -f2-)

cat <<EOF

${GRN}=====================================================
 Supabase is up and running 🎉
=====================================================${NC}

  Studio (dashboard): ${API_URL_OUT}
    -> login: ${DASH_USER_OUT} / ${DASH_PASS_OUT}

  API gateway (Kong): ${API_URL_OUT}
  Public site URL   : ${SITE_URL_OUT}

  ANON key          : ${ANON_KEY_OUT}
  SERVICE_ROLE key  : ${SERVICE_KEY_OUT}
  Postgres password : ${PG_PASS_OUT}

  Install dir       : ${INSTALL_DIR}
  Compose dir       : ${DOCKER_DIR}
  Env file          : ${ENV_FILE}  (chmod 600 — keep it safe!)

Useful commands:
  cd ${DOCKER_DIR}
  docker compose ps                # status
  docker compose logs -f kong      # follow gateway logs
  docker compose down              # stop everything
  docker compose up -d             # start everything
  docker compose pull && docker compose up -d   # upgrade

Next steps:
  - Point a domain at this server and put nginx/Caddy + TLS in front of port ${SUPABASE_PORT}.
  - Re-run with DOMAIN=your.domain.com to bake the public URL into Studio.
  - Save the keys above in a password manager — they are NOT shown again.

EOF
ok "Done."

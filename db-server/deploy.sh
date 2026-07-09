#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  NETLIFE CASH — Server Deploy Script (Stage 1: Postgres + pgAdmin)
#
#  This sets up a clean database server you can manage with pgAdmin.
#  Later, run supabase-selfhost/setup-ubuntu.sh on the SAME server to add
#  the full Supabase stack (it uses different ports, so no conflict).
#
#  Usage:
#    chmod +x deploy.sh
#    sudo ./deploy.sh
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && error "Run as root: sudo ./deploy.sh"

INSTALL_DIR="${INSTALL_DIR:-/opt/netlife-db}"
DOMAIN="${DOMAIN:-}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   NETLIFE CASH — Database Server Setup (Postgres+pgAdmin)║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────
info "Updating system packages..."
apt-get update -qq
apt-get install -y -qq curl wget git openssl ca-certificates gnupg lsb-release apt-transport-https

# ── 2. Docker ──────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  info "Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
  success "Docker installed"
else
  success "Docker already installed ($(docker --version))"
fi

if ! docker compose version &>/dev/null 2>&1; then
  info "Installing Docker Compose v2..."
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | cut -d'"' -f4)
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-$(uname -m)" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  success "Docker Compose v2 installed"
else
  success "Docker Compose already installed"
fi

# ── 3. Install directory ────────────────────────────────────────────────────
info "Setting up install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
  cp "$SCRIPT_DIR/docker-compose.yml" "$INSTALL_DIR/"
  info "Copied docker-compose.yml from $SCRIPT_DIR"
else
  error "docker-compose.yml not found next to deploy.sh"
fi

cd "$INSTALL_DIR"

# ── 4. Generate .env with strong random passwords ──────────────────────────
if [[ ! -f .env ]]; then
  info "Generating .env with secure passwords..."

  DB_PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-24)
  PGADMIN_PASS=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | cut -c1-16)

  cat > .env <<EOF
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$DB_PASS
POSTGRES_DB=netlifecash
POSTGRES_PORT=5432

PGADMIN_EMAIL=admin@netlifecash.com
PGADMIN_PASSWORD=$PGADMIN_PASS
PGADMIN_PORT=5050
EOF

  success ".env generated"
  {
    echo "NETLIFE CASH DB Server Credentials — $(date)"
    echo "Postgres user:      postgres"
    echo "Postgres password:  $DB_PASS"
    echo "Postgres port:      5432"
    echo "pgAdmin URL:        http://$(hostname -I | awk '{print $1}'):5050"
    echo "pgAdmin email:      admin@netlifecash.com"
    echo "pgAdmin password:   $PGADMIN_PASS"
  } > /root/netlife-db-credentials.txt
  chmod 600 /root/netlife-db-credentials.txt
  warn "Credentials saved to /root/netlife-db-credentials.txt"
else
  info ".env already exists — reusing it"
fi

source .env

# ── 5. Start the stack ──────────────────────────────────────────────────────
info "Pulling images..."
docker compose pull

info "Starting Postgres + pgAdmin..."
docker compose up -d

# ── 6. Wait for Postgres to be healthy ──────────────────────────────────────
info "Waiting for Postgres to become healthy..."
MAX_WAIT=60
COUNT=0
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" &>/dev/null; do
  sleep 2
  COUNT=$((COUNT+2))
  [[ $COUNT -ge $MAX_WAIT ]] && error "Postgres failed to start in ${MAX_WAIT}s. Run: docker compose logs postgres"
  printf "."
done
echo ""
success "Postgres is healthy"

# ── 7. Load schema if available ──────────────────────────────────────────────
SCHEMA_FILE=""
[[ -f "$SCRIPT_DIR/../all_migrations.sql" ]] && SCHEMA_FILE="$SCRIPT_DIR/../all_migrations.sql"
[[ -f "$SCRIPT_DIR/all_migrations.sql" ]] && SCHEMA_FILE="$SCRIPT_DIR/all_migrations.sql"

if [[ -n "$SCHEMA_FILE" ]]; then
  info "Found schema file — loading NETLIFE CASH schema..."
  docker compose exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-netlifecash}" < "$SCHEMA_FILE" \
    && success "Schema loaded" \
    || warn "Schema load had warnings — check output above (safe to ignore on re-run)"
else
  info "No schema file found next to this script — skipping (you can load it later via pgAdmin)"
fi

# ── 8. Firewall (open only what's needed) ────────────────────────────────────
if command -v ufw &>/dev/null; then
  info "Configuring firewall (ufw)..."
  ufw allow 22/tcp   >/dev/null 2>&1 || true
  ufw allow 5050/tcp >/dev/null 2>&1 || true   # pgAdmin
  # Postgres port 5432 is NOT opened externally by default for security.
  # Uncomment the next line only if you need remote DB tool access:
  # ufw allow 5432/tcp >/dev/null 2>&1 || true
  success "Firewall rules applied (pgAdmin exposed, Postgres kept internal)"
fi

# ── 9. Systemd auto-start ────────────────────────────────────────────────────
cat > /etc/systemd/system/netlife-db.service <<EOF
[Unit]
Description=NETLIFE CASH Database Server (Postgres + pgAdmin)
Requires=docker.service
After=docker.service network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable netlife-db.service
success "Systemd service registered (auto-starts on reboot)"

# ── Done ──────────────────────────────────────────────────────────────────
SERVER_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                ✅  DATABASE SERVER READY                 ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  pgAdmin       : http://$SERVER_IP:5050"
echo "║  Postgres host : $SERVER_IP (internal port 5432)"
echo "║  Credentials   : /root/netlife-db-credentials.txt         ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Next steps:                                              ║"
echo "║   1. Open pgAdmin in your browser and log in               ║"
echo "║   2. Add New Server → Host: netlife-db (or 'postgres')     ║"
echo "║      Port: 5432, User/Pass from credentials file            ║"
echo "║   3. When ready for full Supabase, run:                    ║"
echo "║      supabase-selfhost/setup-ubuntu.sh (uses port 8000/3000)║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

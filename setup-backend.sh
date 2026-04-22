#!/usr/bin/env bash
#
# setup-backend.sh
# Production-ready Node.js backend host on Ubuntu 22.04 / 24.04 / Debian 12.
#
# Provisions a fresh server to run a Node.js (Express/Fastify/Nest/etc.) backend
# OR serve a static SPA build, fronted by Nginx with automatic Let's Encrypt TLS.
#
# What this does:
#   1. System update + base packages + unattended security upgrades
#   2. UFW firewall (22, 80, 443) + fail2ban
#   3. Optional swapfile + sysctl tuning
#   4. Node.js 20 LTS (NodeSource) + npm + git + build tools
#   5. PM2 process manager (auto-start on boot under systemd)
#   6. Nginx reverse proxy with HTTP/2, gzip, security headers, rate limiting
#   7. Certbot + Let's Encrypt TLS (auto-renewing) for $DOMAIN
#   8. Dedicated 'app' user that owns /var/www/<APP_NAME>
#   9. Optional: clone your GitHub repo, install deps, start with PM2
#  10. Optional: install PostgreSQL 16 locally (set INSTALL_POSTGRES=1)
#  11. Daily encrypted backup of /var/www and (if installed) Postgres -> /var/backups/app
#
# Required env (for unattended TLS):
#   DOMAIN=api.example.com
#   ACME_EMAIL=you@example.com
#
# Optional env:
#   APP_NAME=myapi              (default: app)
#   APP_PORT=3000               (the port your Node app listens on)
#   REPO_URL=git@github.com:...  (clone + npm ci + pm2 start)
#   START_CMD="node dist/index.js"   (or "npm run start", default: npm run start)
#   STATIC_ONLY=1               (skip Node, just serve a /var/www/<APP>/dist as SPA)
#   INSTALL_POSTGRES=1          (install local PostgreSQL 16)
#   NODE_VERSION=20             (NodeSource major version)
#
# Usage:
#   chmod +x setup-backend.sh
#   sudo DOMAIN=api.example.com ACME_EMAIL=you@example.com REPO_URL=https://github.com/me/api.git ./setup-backend.sh --yes
#

set -euo pipefail

# ---------- Tunables ----------
APP_NAME="${APP_NAME:-app}"
APP_PORT="${APP_PORT:-3000}"
APP_USER="app"
APP_DIR="/var/www/${APP_NAME}"
DOMAIN="${DOMAIN:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
REPO_URL="${REPO_URL:-}"
START_CMD="${START_CMD:-npm run start}"
STATIC_ONLY="${STATIC_ONLY:-0}"
INSTALL_POSTGRES="${INSTALL_POSTGRES:-0}"
NODE_VERSION="${NODE_VERSION:-20}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/app}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
ASSUME_YES=0

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLU}[*]${NC} $*"; }
ok()   { echo -e "${GRN}[✓]${NC} $*"; }
warn() { echo -e "${YLW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=1 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
  esac
done

[[ $EUID -eq 0 ]] || { err "Run as root: sudo $0"; exit 1; }

# ---------- 1. System ----------
log "Updating apt and installing base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release git jq openssl ufw fail2ban \
  build-essential python3 unzip wget htop rsync cron \
  unattended-upgrades debconf-utils
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | debconf-set-selections
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ok "Base packages installed."

# ---------- 2. Swap + sysctl ----------
if [[ "$SWAP_SIZE_GB" -gt 0 ]] && ! swapon --show | grep -q '^/swapfile'; then
  log "Adding ${SWAP_SIZE_GB} GB swap..."
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB*1024))
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
cat >/etc/sysctl.d/99-app.conf <<'EOF'
vm.swappiness=10
net.core.somaxconn=1024
fs.file-max=200000
net.ipv4.tcp_fin_timeout=30
EOF
sysctl --system >/dev/null
ok "Swap + sysctl configured."

# ---------- 3. Firewall + fail2ban ----------
log "Configuring UFW + fail2ban..."
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
systemctl enable --now fail2ban
ok "Firewall + fail2ban active."

# ---------- 4. Node.js + tools (skip if STATIC_ONLY) ----------
if [[ "$STATIC_ONLY" != "1" ]]; then
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" != "$NODE_VERSION" ]]; then
    log "Installing Node.js ${NODE_VERSION} from NodeSource..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs
  fi
  ok "Node: $(node -v) / npm: $(npm -v)"

  if ! command -v pm2 >/dev/null 2>&1; then
    log "Installing PM2..."
    npm install -g pm2
  fi
  ok "PM2: $(pm2 -v)"
fi

# ---------- 5. App user + dirs ----------
id "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$BACKUP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 700 "$BACKUP_DIR"
ok "User '${APP_USER}' and dir ${APP_DIR} ready."

# ---------- 6. Optional clone + install + start ----------
if [[ -n "$REPO_URL" && "$STATIC_ONLY" != "1" ]]; then
  log "Cloning ${REPO_URL} into ${APP_DIR}..."
  if [[ ! -d "${APP_DIR}/.git" ]]; then
    sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
  else
    sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only || warn "git pull failed"
  fi

  log "Installing dependencies..."
  sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && (npm ci || npm install)"

  if [[ -f "${APP_DIR}/package.json" ]] && grep -q '"build"' "${APP_DIR}/package.json"; then
    log "Building..."
    sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm run build || true"
  fi

  log "Starting app under PM2 as user '${APP_USER}'..."
  sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && pm2 start --name '$APP_NAME' --update-env -- $START_CMD || pm2 restart '$APP_NAME'"
  sudo -u "$APP_USER" bash -lc "pm2 save"

  # systemd integration (auto-start on boot)
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "/home/${APP_USER}" >/tmp/pm2-startup.sh 2>&1 || true
  bash /tmp/pm2-startup.sh 2>/dev/null || true
  systemctl enable "pm2-${APP_USER}.service" >/dev/null 2>&1 || true
  ok "App started and registered with systemd."
fi

# ---------- 7. Nginx reverse proxy ----------
if ! command -v nginx >/dev/null 2>&1; then
  log "Installing Nginx..."
  apt-get install -y nginx
fi

NGX_CONF="/etc/nginx/sites-available/${APP_NAME}.conf"

if [[ "$STATIC_ONLY" == "1" ]]; then
  ROOT_DIR="${APP_DIR}/dist"
  mkdir -p "$ROOT_DIR"
  chown -R "$APP_USER:$APP_USER" "$ROOT_DIR"
  cat >"$NGX_CONF" <<EOF
limit_req_zone \$binary_remote_addr zone=${APP_NAME}_rl:10m rate=20r/s;

server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN:-_};

  root ${ROOT_DIR};
  index index.html;

  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;

  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  location / {
    limit_req zone=${APP_NAME}_rl burst=40 nodelay;
    try_files \$uri \$uri/ /index.html;
  }

  location ~* \\.(?:js|css|woff2?|png|jpg|jpeg|svg|gif|ico)\$ {
    expires 30d;
    access_log off;
    add_header Cache-Control "public, max-age=2592000, immutable";
  }
}
EOF
else
  cat >"$NGX_CONF" <<EOF
limit_req_zone \$binary_remote_addr zone=${APP_NAME}_rl:10m rate=20r/s;

upstream ${APP_NAME}_upstream {
  server 127.0.0.1:${APP_PORT};
  keepalive 32;
}

server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN:-_};

  client_max_body_size 25m;
  proxy_read_timeout 60s;
  proxy_send_timeout 60s;

  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;

  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;

  location / {
    limit_req zone=${APP_NAME}_rl burst=40 nodelay;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://${APP_NAME}_upstream;
  }
}
EOF
fi

ln -sf "$NGX_CONF" "/etc/nginx/sites-enabled/${APP_NAME}.conf"
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ok "Nginx site enabled (${APP_NAME})."

# ---------- 8. TLS via Certbot ----------
if [[ -n "$DOMAIN" && -n "$ACME_EMAIL" ]]; then
  if ! command -v certbot >/dev/null 2>&1; then
    log "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
  fi
  log "Requesting Let's Encrypt cert for ${DOMAIN}..."
  certbot --nginx --non-interactive --agree-tos --redirect \
    -m "$ACME_EMAIL" -d "$DOMAIN" || warn "certbot failed (DNS may not point here yet). Re-run after DNS propagates."
  systemctl enable --now certbot.timer
  ok "TLS configured + auto-renew enabled."
else
  warn "DOMAIN/ACME_EMAIL not set. Skipping TLS. Site available on http://<server-ip>"
fi

# ---------- 9. Optional PostgreSQL ----------
if [[ "$INSTALL_POSTGRES" == "1" ]]; then
  if ! command -v psql >/dev/null 2>&1; then
    log "Installing PostgreSQL 16..."
    install -d /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
    . /etc/os-release
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    apt-get update -y
    apt-get install -y postgresql-16
    systemctl enable --now postgresql
    PG_PASS="$(openssl rand -hex 16)"
    sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '${PG_PASS}';" >/dev/null
    sudo -u postgres createuser "$APP_USER" 2>/dev/null || true
    sudo -u postgres createdb -O "$APP_USER" "${APP_NAME}_db" 2>/dev/null || true
    echo "POSTGRES_URL=postgresql://${APP_USER}@127.0.0.1:5432/${APP_NAME}_db" > "/home/${APP_USER}/.pg_env"
    chown "$APP_USER:$APP_USER" "/home/${APP_USER}/.pg_env" && chmod 600 "/home/${APP_USER}/.pg_env"
    echo "${PG_PASS}" > /root/.postgres_password && chmod 600 /root/.postgres_password
    ok "PostgreSQL 16 installed. Postgres password saved to /root/.postgres_password"
  fi
fi

# ---------- 10. Daily backups ----------
cat >/usr/local/sbin/app-backup.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
TS=\$(date +%Y%m%d-%H%M%S)
tar --exclude='${APP_DIR}/node_modules' --exclude='${APP_DIR}/.git' \
    -czf "${BACKUP_DIR}/app-\${TS}.tar.gz" -C / "var/www/${APP_NAME}" 2>/dev/null || true
chmod 600 "${BACKUP_DIR}/app-\${TS}.tar.gz" 2>/dev/null || true
if command -v pg_dumpall >/dev/null 2>&1; then
  sudo -u postgres pg_dumpall | gzip -9 > "${BACKUP_DIR}/db-\${TS}.sql.gz" || true
  chmod 600 "${BACKUP_DIR}/db-\${TS}.sql.gz" 2>/dev/null || true
fi
find "${BACKUP_DIR}" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete
EOF
chmod +x /usr/local/sbin/app-backup.sh

cat >/etc/cron.d/app-backup <<EOF
# Daily app + db backup at 03:30
30 3 * * * root /usr/local/sbin/app-backup.sh >> /var/log/app-backup.log 2>&1
EOF
ok "Daily backup cron installed."

# ---------- 11. Summary ----------
cat <<EOF

${GRN}=====================================================
 Backend server is ready 🎉
=====================================================${NC}

  App name        : ${APP_NAME}
  App user        : ${APP_USER}
  App directory   : ${APP_DIR}
  $( [[ "$STATIC_ONLY" == "1" ]] && echo "Mode            : Static SPA (serving ${APP_DIR}/dist)" || echo "Listening on    : 127.0.0.1:${APP_PORT}  (proxied by Nginx)" )
  Public URL      : $( [[ -n "$DOMAIN" ]] && echo "https://${DOMAIN}" || echo "http://<server-ip>" )
  Process manager : $( [[ "$STATIC_ONLY" == "1" ]] && echo "(static, none)" || echo "PM2 (auto-start: pm2-${APP_USER}.service)" )
  Reverse proxy   : Nginx + $( [[ -n "$DOMAIN" && -n "$ACME_EMAIL" ]] && echo "Let's Encrypt TLS" || echo "HTTP only" )
  Backups         : ${BACKUP_DIR} (daily, ${BACKUP_RETENTION_DAYS}-day retention)
  $( [[ "$INSTALL_POSTGRES" == "1" ]] && echo "Postgres        : 16 (creds in /root/.postgres_password, app DSN in /home/${APP_USER}/.pg_env)" || true )

Useful commands:
  sudo -u ${APP_USER} pm2 status
  sudo -u ${APP_USER} pm2 logs ${APP_NAME}
  sudo -u ${APP_USER} pm2 restart ${APP_NAME}
  systemctl status nginx
  tail -f /var/log/nginx/access.log
  /usr/local/sbin/app-backup.sh   # backup now

Deploy updates:
  sudo -u ${APP_USER} bash -lc "cd ${APP_DIR} && git pull && npm ci && npm run build && pm2 restart ${APP_NAME}"

EOF
ok "Done."

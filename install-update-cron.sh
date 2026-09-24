#!/usr/bin/env bash
# Install the monthly application update cron entry.
#
# Usage:
#   sudo bash install-update-cron.sh \
#     --app-dir /opt/netlifecash \
#     --app-user root \
#     --app-name netlifecash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="root"
APP_NAME="netlifecash"
CRON_USER=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="${2:?--app-dir requires a value}"; shift 2 ;;
    --app-user) APP_USER="${2:?--app-user requires a value}"; shift 2 ;;
    --app-name) APP_NAME="${2:?--app-name requires a value}"; shift 2 ;;
    --cron-user) CRON_USER="${2:?--cron-user requires a value}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo $0 ..." >&2; exit 1; }
[[ -x "${APP_DIR}/scheduled-update.sh" ]] || {
  echo "Missing executable ${APP_DIR}/scheduled-update.sh" >&2
  exit 1
}
[[ -x "${APP_DIR}/update-app.sh" ]] || {
  echo "Missing executable ${APP_DIR}/update-app.sh" >&2
  exit 1
}

CRON_USER="${CRON_USER:-${APP_USER}}"
id "$CRON_USER" >/dev/null 2>&1 || { echo "Unknown cron user: ${CRON_USER}" >&2; exit 1; }

SAFE_NAME="$(printf '%s' "$APP_NAME" | tr -c 'A-Za-z0-9_-' '-')"
CRON_FILE="/etc/cron.d/${SAFE_NAME}-update"

if [[ ! -f "${APP_DIR}/.update-schedule.json" ]]; then
  printf '%s\n' '{"enabled":true,"day":10,"hour":3,"minute":0}' > "${APP_DIR}/.update-schedule.json"
fi
chown "${CRON_USER}:${CRON_USER}" "${APP_DIR}/.update-schedule.json" 2>/dev/null || true
chmod 600 "${APP_DIR}/.update-schedule.json"

cat > "$CRON_FILE" <<EOF
# ${APP_NAME} monthly pull, build, and service restart
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 10 * * ${CRON_USER} ${APP_DIR}/scheduled-update.sh >> /var/log/${SAFE_NAME}-update.log 2>&1
EOF
chown root:root "$CRON_FILE"
chmod 644 "$CRON_FILE"

if command -v systemctl >/dev/null 2>&1; then
  systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true
fi

echo "Installed ${CRON_FILE}: 03:00 on the 10th of every month (${CRON_USER})."
#!/usr/bin/env bash
# =============================================================================
# NETLIFE CASH — Port and Firewall Guard
#
# Usage:
#   sudo ./port-guard.sh check
#   sudo ./port-guard.sh apply
#   sudo ./port-guard.sh open 3000/tcp
#   sudo ./port-guard.sh lock 3000/tcp
#
# `apply` opens SSH and the configured frontend port. If DOMAIN_NAME is set,
# it also opens 80/443. All other incoming traffic is denied by default.
# The build server and deploy webhook remain private unless opened explicitly.
# =============================================================================
set -Eeuo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
BLU='\033[0;34m'
NC='\033[0m'

log()  { printf '%b\n' "${BLU}[port-guard]${NC} $*"; }
ok()   { printf '%b\n' "${GRN}[  ✓  ]${NC} $*"; }
warn() { printf '%b\n' "${YLW}[warn ]${NC} $*" >&2; }
err()  { printf '%b\n' "${RED}[error]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-/opt/netlifecash/.env}"
[[ -f "$ENV_FILE" ]] || ENV_FILE="${SCRIPT_DIR}/.env"
STATE_FILE="/etc/netlifecash/port-guard.managed"

dotenv_value() {
  local key="$1"
  local file="$2"
  local line value

  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    line="${line#"${line%%[![:space:]]*}"}"
    [[ "$line" == export[[:space:]]* ]] && line="${line#export }"
    if [[ "$line" =~ ^${key}=(.*)$ ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ ${#value} -ge 2 &&
            ( "${value:0:1}" == '"' && "${value: -1}" == '"' ||
              "${value:0:1}" == "'" && "${value: -1}" == "'" ) ]]; then
        value="${value:1:${#value}-2}"
      fi
      printf '%s' "$value"
      return 0
    fi
  done < "$file"
}

APP_PORT="$(dotenv_value APP_PORT "$ENV_FILE")"
APP_PORT="${APP_PORT:-80}"
BUILD_SERVER_PORT="$(dotenv_value BUILD_SERVER_PORT "$ENV_FILE")"
BUILD_SERVER_PORT="${BUILD_SERVER_PORT:-3001}"
WEBHOOK_PORT="$(dotenv_value WEBHOOK_PORT "$ENV_FILE")"
WEBHOOK_PORT="${WEBHOOK_PORT:-9000}"
DOMAIN_NAME="$(dotenv_value DOMAIN_NAME "$ENV_FILE")"
SSH_PORT="$(dotenv_value SSH_PORT "$ENV_FILE")"

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && ((1 <= 10#$1 && 10#$1 <= 65535))
}

for named_port in \
  "APP_PORT=$APP_PORT" \
  "BUILD_SERVER_PORT=$BUILD_SERVER_PORT" \
  "WEBHOOK_PORT=$WEBHOOK_PORT"; do
  port_name="${named_port%%=*}"
  port_value="${named_port#*=}"
  valid_port "$port_value" || err "Invalid ${port_name}: ${port_value}"
done

detect_ssh_port() {
  if [[ -n "$SSH_PORT" ]]; then
    printf '%s' "$SSH_PORT"
    return 0
  fi

  ss -H -ltnp 2>/dev/null | awk '
    /sshd/ {
      n = split($4, address, ":")
      port = address[n]
      gsub(/[^0-9].*/, "", port)
      if (port != "") { print port; exit }
    }'
}

SSH_PORT="$(detect_ssh_port || true)"
SSH_PORT="${SSH_PORT:-22}"
valid_port "$SSH_PORT" || err "Invalid SSH_PORT: ${SSH_PORT}"

desired_specs=()
desired_specs+=("${SSH_PORT}/tcp")
desired_specs+=("${APP_PORT}/tcp")
if [[ -n "$DOMAIN_NAME" ]]; then
  desired_specs+=("80/tcp" "443/tcp")
fi

contains_spec() {
  local wanted="$1"
  local spec
  for spec in "${desired_specs[@]}"; do
    [[ "$spec" == "$wanted" ]] && return 0
  done
  return 1
}

port_number() { printf '%s' "${1%%/*}"; }
port_protocol() { printf '%s' "${1#*/}"; }

listener_state() {
  local port="$1"
  if ss -H -ltn 2>/dev/null | awk -v wanted="$port" '
      { n = split($4, address, ":"); if (address[n] == wanted) found = 1 }
      END { exit !found }'; then
    printf 'LISTENING'
  else
    printf 'NOT_LISTENING'
  fi
}

ufw_state() {
  local spec="$1"
  local port="${spec%/*}"
  local protocol="${spec#*/}"
  if ! command -v ufw >/dev/null 2>&1; then
    printf 'UFW_UNAVAILABLE'
  elif ufw status 2>/dev/null | awk -v wanted="${port}/${protocol}" '
      $1 == wanted && $2 ~ /^ALLOW/ { found = 1 }
      END { exit !found }'; then
    printf 'ALLOWED'
  else
    printf 'NOT_ALLOWED'
  fi
}

print_status() {
  local label="$1"
  local spec="$2"
  local port
  port="$(port_number "$spec")"
  printf '  %-20s %-10s firewall=%-13s %s\n' \
    "$label" "$spec" "$(ufw_state "$spec")" "$(listener_state "$port")"
}

check_status() {
  log "Configuration source: ${ENV_FILE}"; 
  log "SSH is protected on ${SSH_PORT}/tcp"
  echo ""
  print_status "Frontend" "${APP_PORT}/tcp"
  print_status "Build server" "${BUILD_SERVER_PORT}/tcp"
  print_status "Deploy webhook" "${WEBHOOK_PORT}/tcp"
  if [[ -n "$DOMAIN_NAME" ]]; then
    print_status "HTTP" "80/tcp"
    print_status "HTTPS" "443/tcp"
  fi
  echo ""

  if command -v ufw >/dev/null 2>&1; then
    log "UFW status:"
    ufw status verbose || true
  elif command -v firewall-cmd >/dev/null 2>&1; then
    log "firewalld status:"
    firewall-cmd --state || true
    firewall-cmd --list-all || true
  else
    warn "Neither UFW nor firewalld is installed."
  fi

  echo ""
  log "Local checks:"
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null; then
      ok "Frontend health endpoint responds on ${APP_PORT}"
    else
      warn "Frontend health endpoint did not respond on ${APP_PORT}"
    fi
    if curl -fsS --max-time 3 "http://127.0.0.1:${BUILD_SERVER_PORT}/api/health" >/dev/null; then
      ok "Build-server health endpoint responds on ${BUILD_SERVER_PORT}"
    else
      warn "Build-server health endpoint did not respond on ${BUILD_SERVER_PORT}"
    fi
  else
    warn "curl is not installed; skipped HTTP checks."
  fi
}

require_root() {
  [[ ${EUID} -eq 0 ]] || err "Run this operation with sudo."
}

firewall_allow() {
  local spec="$1"
  local port="${spec%/*}"
  local protocol="${spec#*/}"
  if command -v ufw >/dev/null 2>&1; then
    ufw allow "${port}/${protocol}" comment "NETLIFE CASH managed" >/dev/null
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port="${port}/${protocol}" >/dev/null
  else
    err "Neither UFW nor firewalld is installed."
  fi
}

firewall_delete_allow() {
  local spec="$1"
  local port="${spec%/*}"
  local protocol="${spec#*/}"
  if command -v ufw >/dev/null 2>&1; then
    ufw delete allow "${port}/${protocol}" >/dev/null 2>&1 || true
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port="${port}/${protocol}" >/dev/null 2>&1 || true
  fi
}

firewall_lock() {
  local spec="$1"
  local port="${spec%/*}"
  local protocol="${spec#*/}"
  firewall_delete_allow "$spec"
  if command -v ufw >/dev/null 2>&1; then
    ufw deny "${port}/${protocol}" comment "NETLIFE CASH locked" >/dev/null
  elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port="${port}/${protocol}" >/dev/null 2>&1 || true
  else
    err "Neither UFW nor firewalld is installed."
  fi
}

apply_policy() {
  require_root
  mkdir -p "$(dirname "$STATE_FILE")"

  if command -v ufw >/dev/null 2>&1; then
    ufw default deny incoming >/dev/null
    ufw default allow outgoing >/dev/null
  elif command -v firewall-cmd >/dev/null 2>&1; then
    systemctl enable --now firewalld
  else
    err "Neither UFW nor firewalld is installed."
  fi

  # Add SSH before enabling the firewall so a remote deployment is not locked
  # out. The policy does not reset existing rules.
  local spec old_spec
  firewall_allow "${SSH_PORT}/tcp"
  for spec in "${desired_specs[@]}"; do
    firewall_allow "$spec"
  done

  # These services are intentionally private by default. Explicit deny rules
  # also remove stale public allow rules left by older deployment versions.
  for spec in \
    "${BUILD_SERVER_PORT}/tcp" \
    "${WEBHOOK_PORT}/tcp" \
    "80/tcp" \
    "443/tcp"; do
    contains_spec "$spec" || firewall_lock "$spec"
  done

  # Remove only old rules previously managed by this script. Other user rules
  # are intentionally preserved.
  if [[ -f "$STATE_FILE" ]]; then
    while IFS= read -r old_spec; do
      [[ -z "$old_spec" ]] && continue
      contains_spec "$old_spec" || firewall_delete_allow "$old_spec"
    done < "$STATE_FILE"
  fi

  printf '%s\n' "${desired_specs[@]}" | sort -u > "$STATE_FILE"
  chmod 600 "$STATE_FILE"

  if command -v ufw >/dev/null 2>&1; then
    ufw --force enable >/dev/null
  else
    firewall-cmd --reload >/dev/null
  fi

  ok "Firewall policy applied. SSH remains open on ${SSH_PORT}/tcp."
  log "Public managed ports: ${desired_specs[*]}"
  warn "Build server ${BUILD_SERVER_PORT}/tcp and webhook ${WEBHOOK_PORT}/tcp remain private by default."
}

open_port() {
  require_root
  local spec="$1"
  [[ "$spec" == */* ]] || spec="${spec}/tcp"
  valid_port "$(port_number "$spec")" || err "Invalid port: ${spec}"
  [[ "${spec#*/}" =~ ^(tcp|udp)$ ]] || err "Protocol must be tcp or udp: ${spec}"
  firewall_allow "$spec"
  if command -v firewall-cmd >/dev/null 2>&1 && ! command -v ufw >/dev/null 2>&1; then
    firewall-cmd --reload >/dev/null
  fi
  ok "Opened ${spec}"
}

lock_port() {
  require_root
  local spec="$1"
  [[ "$spec" == */* ]] || spec="${spec}/tcp"
  valid_port "$(port_number "$spec")" || err "Invalid port: ${spec}"
  [[ "${spec#*/}" =~ ^(tcp|udp)$ ]] || err "Protocol must be tcp or udp: ${spec}"
  firewall_lock "$spec"
  if command -v firewall-cmd >/dev/null 2>&1 && ! command -v ufw >/dev/null 2>&1; then
    firewall-cmd --reload >/dev/null
  fi
  ok "Locked ${spec}"
}

usage() {
  cat <<'USAGE'
Usage:
  sudo ./port-guard.sh check
  sudo ./port-guard.sh apply
  sudo ./port-guard.sh open PORT[/tcp|udp]
  sudo ./port-guard.sh lock PORT[/tcp|udp]

Examples:
  sudo ./port-guard.sh check
  sudo ./port-guard.sh apply
  sudo ./port-guard.sh open 9000/tcp
  sudo ./port-guard.sh lock 3000/tcp
USAGE
}

case "${1:-check}" in
  check) check_status ;;
  apply) apply_policy ;;
  open) [[ -n "${2:-}" ]] || err "Specify a port to open."; open_port "$2" ;;
  lock) [[ -n "${2:-}" ]] || err "Specify a port to lock."; lock_port "$2" ;;
  -h|--help|help) usage ;;
  *) usage; exit 2 ;;
esac
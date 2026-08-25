#!/usr/bin/env bash
# =============================================================================
# Virtual Bank — update all supported software
#
# Usage:
#   sudo bash update-software.sh                 # system + project + Android
#   sudo bash update-software.sh --project       # npm dependencies + build
#   sudo bash update-software.sh --system        # OS packages only
#   sudo bash update-software.sh --android       # Android SDK packages only
#   sudo bash update-software.sh --docker        # pull and restart compose apps
#   sudo bash update-software.sh --all --reboot  # include an optional reboot
#
# The script updates installed packages and versions already supported by the
# project. It does not blindly change major application versions or delete
# Docker volumes.
# =============================================================================
set -Eeuo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GRN}[update]${NC} $*"; }
info() { echo -e "${BLU}[info  ]${NC} $*"; }
warn() { echo -e "${YLW}[warn  ]${NC} $*"; }
die()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DO_SYSTEM=false
DO_PROJECT=false
DO_ANDROID=false
DO_DOCKER=false
REBOOT=false

for arg in "$@"; do
  case "$arg" in
    --all)     DO_SYSTEM=true; DO_PROJECT=true; DO_ANDROID=true; DO_DOCKER=true ;;
    --system)  DO_SYSTEM=true ;;
    --project) DO_PROJECT=true ;;
    --android) DO_ANDROID=true ;;
    --docker)  DO_DOCKER=true ;;
    --reboot)  REBOOT=true ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) die "Unknown option: $arg (use --help)" ;;
  esac
done

if [[ "$DO_SYSTEM$DO_PROJECT$DO_ANDROID$DO_DOCKER" == "falsefalsefalsefalse" ]]; then
  DO_SYSTEM=true; DO_PROJECT=true; DO_ANDROID=true
fi

if [[ "$DO_SYSTEM" == true && "$EUID" -ne 0 ]]; then
  die "--system requires root. Re-run with sudo."
fi

on_error() {
  local code=$?
  echo -e "${RED}[error]${NC} Update failed at line ${BASH_LINENO[0]}: ${BASH_COMMAND}" >&2
  exit "$code"
}
trap on_error ERR

if [[ "$DO_SYSTEM" == true ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    log "Updating Debian/Ubuntu system packages…"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get upgrade -y
    apt-get autoremove -y
    apt-get autoclean -y
  elif command -v dnf >/dev/null 2>&1; then
    log "Updating DNF system packages…"
    dnf upgrade -y
  elif command -v yum >/dev/null 2>&1; then
    log "Updating YUM system packages…"
    yum update -y
  else
    die "No supported system package manager found."
  fi
  log "System packages updated."
fi

if [[ "$DO_PROJECT" == true ]]; then
  command -v npm >/dev/null 2>&1 || die "npm is required for project updates."
  [[ -f "$SCRIPT_DIR/package.json" ]] || die "package.json not found in $SCRIPT_DIR."
  log "Updating project dependencies within package.json version ranges…"
  (cd "$SCRIPT_DIR" && npm update)
  log "Reinstalling from the updated lockfile…"
  (cd "$SCRIPT_DIR" && npm ci)
  log "Validating the production web build…"
  (cd "$SCRIPT_DIR" && npm run build)
  log "Project dependencies updated."
fi

if [[ "$DO_ANDROID" == true ]]; then
  ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [[ -z "$ANDROID_HOME" ]]; then
    for candidate in /opt/android-sdk "$HOME/Android/Sdk"; do
      [[ -d "$candidate" ]] && { ANDROID_HOME="$candidate"; break; }
    done
  fi
  SDKMANAGER="${ANDROID_HOME:-}/cmdline-tools/latest/bin/sdkmanager"
  if [[ -x "$SDKMANAGER" ]]; then
    log "Accepting Android SDK licenses and updating installed SDK packages…"
    yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true
    "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --update
    log "Android SDK packages updated."
  else
    warn "Android SDK manager not found; skipping Android updates."
  fi
fi

if [[ "$DO_DOCKER" == true ]]; then
  command -v docker >/dev/null 2>&1 || die "Docker is required for --docker."
  mapfile -t compose_files < <(find "$SCRIPT_DIR" -maxdepth 3 -name docker-compose.yml -type f -print)
  if ((${#compose_files[@]} == 0)); then
    warn "No docker-compose.yml found; skipping Docker updates."
  else
    for compose_file in "${compose_files[@]}"; do
      compose_dir="$(dirname "$compose_file")"
      log "Pulling and restarting services in $compose_dir…"
      (cd "$compose_dir" && docker compose -f "$compose_file" pull && docker compose -f "$compose_file" up -d --remove-orphans)
    done
  fi
fi

echo ""
log "Software update complete."
if [[ "$REBOOT" == true ]]; then
  [[ "$EUID" -eq 0 ]] || die "--reboot requires root."
  warn "Rebooting in 10 seconds; press Ctrl-C to cancel."
  sleep 10
  systemctl reboot
else
  info "No reboot requested. Use --reboot only when your OS update requires it."
fi
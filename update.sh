#!/usr/bin/env bash
set -Eeuo pipefail

# One entry point for project maintenance.
#
# Examples:
#   bash update.sh --project       # pull source, update npm packages, build web app
#   bash update.sh --source        # pull source only
#   bash update.sh                  # full maintenance update
#   bash update.sh --all --reboot  # full update followed by reboot

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPDATE_SCRIPT="$SCRIPT_DIR/update-software.sh"

[[ -f "$UPDATE_SCRIPT" ]] || {
  echo "update-software.sh not found in $SCRIPT_DIR" >&2
  exit 1
}

# Project/source-only updates should run as the current user so GitHub secrets
# and the user's Git credentials remain available. System/Android/Docker
# scopes are elevated only when needed.
needs_root=false
has_args=false
for arg in "$@"; do
  has_args=true
  case "$arg" in
    --project|--source) ;;
    *) needs_root=false; break ;;
  esac
done

if [[ "$has_args" == false ]]; then
  needs_root=true
fi

if [[ "$needs_root" == true ]]; then
  exec bash "$UPDATE_SCRIPT" "$@"
fi

if [[ "$EUID" -eq 0 ]]; then
  exec bash "$UPDATE_SCRIPT" "$@"
fi

exec sudo -E bash "$UPDATE_SCRIPT" "$@"
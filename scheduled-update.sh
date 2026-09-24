#!/usr/bin/env bash
# Run the monthly application update from cron.
#
# The installer creates a cron entry for the 10th of each month at 03:00.
# The enable flag is maintained by the admin settings page through
# .update-schedule.json, so disabling the schedule does not require editing
# the host's crontab.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEDULE_FILE="${UPDATE_SCHEDULE_FILE:-${SCRIPT_DIR}/.update-schedule.json}"
BRANCH="${UPDATE_BRANCH:-main}"

if [[ -f "$SCHEDULE_FILE" ]] && ! grep -Eq '"enabled"[[:space:]]*:[[:space:]]*true' "$SCHEDULE_FILE"; then
  echo "[scheduled-update] Disabled in ${SCHEDULE_FILE}; nothing to do."
  exit 0
fi

LOCK_FILE="${UPDATE_LOCK_FILE:-${SCRIPT_DIR}/.update.lock}"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[scheduled-update] Another update is already running; exiting."
  exit 0
fi

cd "$SCRIPT_DIR"
echo "[scheduled-update] Starting monthly update for branch ${BRANCH}."
exec bash "${SCRIPT_DIR}/update-app.sh" "--branch=${BRANCH}"
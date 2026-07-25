#!/usr/bin/env bash
# =============================================================================
#  Virtual Bank (NETLIFE CASH) — App Update Script
#  Ubuntu 22.04 | safe to run on a live server
#
#  WHAT IT DOES:
#    ✓ Pulls latest code from git
#    ✓ Installs/updates npm dependencies (only if package.json changed)
#    ✓ Rebuilds the frontend (Vite production build)
#    ✓ Restarts the app (PM2 or systemd — auto-detected)
#
#  WHAT IT NEVER TOUCHES:
#    ✗ Your .env file
#    ✗ Your PostgreSQL / Supabase database
#    ✗ Any migration files
#    ✗ Your SSL certificates
#    ✗ nginx config
#
#  USAGE:
#    bash update-app.sh               # normal update
#    bash update-app.sh --skip-build  # pull + restart only (no npm build)
#    bash update-app.sh --branch main # pull a specific branch
#
#  SETUP (first time only):
#    chmod +x update-app.sh
#    # Make sure your server has git access to the repo.
#    # For private repos: git remote set-url origin git@github.com:USER/REPO.git
# =============================================================================
set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; CYN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GRN}[update]${NC} $*"; }
info() { echo -e "${BLU}[info  ]${NC} $*"; }
warn() { echo -e "${YLW}[warn  ]${NC} $*"; }
ok()   { echo -e "${GRN}[  ✓  ]${NC} $*"; }
err()  { echo -e "${RED}[error ]${NC} $*" >&2; exit 1; }

# ── Parse flags ────────────────────────────────────────────────────────────────
SKIP_BUILD=false
BRANCH=""
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --branch)     shift; BRANCH="${1:-}" ;;
    --branch=*)   BRANCH="${arg#*=}" ;;
  esac
done

# ── Locate script directory (works even if called from a different cwd) ────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
log "Working directory: $SCRIPT_DIR"

# ── Safety check — make sure this is a git repo ───────────────────────────────
if [ ! -d ".git" ]; then
  err "No .git directory found in $SCRIPT_DIR. Is this a git repository?"
fi

# ── Safety check — .env must exist (never create or overwrite it) ─────────────
if [ ! -f ".env" ]; then
  warn ".env not found. The app will use environment variables instead."
  warn "If something breaks, copy .env.ubuntu.example to .env and fill it in."
fi

# ── Detect process manager ────────────────────────────────────────────────────
detect_pm() {
  if command -v pm2 &>/dev/null && pm2 list 2>/dev/null | grep -q "virtualbank\|netlife\|vite_react"; then
    echo "pm2"
  elif systemctl list-units --type=service 2>/dev/null | grep -q "virtualbank"; then
    echo "systemd"
  else
    echo "none"
  fi
}

PM=$(detect_pm)
info "Process manager detected: ${PM:-none}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: git pull
# ─────────────────────────────────────────────────────────────────────────────
log "Step 1/4 — Fetching latest code from git..."

# Stash any local uncommitted changes (protect server-side edits like .env)
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  warn "Local changes detected — stashing them to allow clean pull."
  git stash --include-untracked --message "auto-stash by update-app.sh $(date '+%Y-%m-%d %H:%M:%S')"
  STASHED=true
else
  STASHED=false
fi

# Switch branch if requested
if [ -n "$BRANCH" ]; then
  log "Switching to branch: $BRANCH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
fi

# Record old package.json hash to detect dependency changes
OLD_PKG_HASH=$(md5sum package.json 2>/dev/null | awk '{print $1}' || echo "")

git fetch origin
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
BEFORE_SHA=$(git rev-parse HEAD)

git pull origin "$CURRENT_BRANCH"
AFTER_SHA=$(git rev-parse HEAD)

if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  ok "Already up to date ($(git rev-parse --short HEAD))"
else
  ok "Updated: $(git rev-parse --short "$BEFORE_SHA") → $(git rev-parse --short HEAD)"
  # Show what changed (excluding .env and migrations)
  info "Changed files:"
  git diff --name-only "$BEFORE_SHA" HEAD | grep -v '\.env\|migration\|\.sql' | head -30 || true
fi

# Restore stash if we stashed
if [ "$STASHED" = true ]; then
  git stash pop 2>/dev/null && info "Local stash restored." || warn "Could not restore stash — check 'git stash list'"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Install dependencies (only if package.json changed)
# ─────────────────────────────────────────────────────────────────────────────
NEW_PKG_HASH=$(md5sum package.json 2>/dev/null | awk '{print $1}' || echo "")

if [ "$SKIP_BUILD" = true ]; then
  info "Step 2/4 — Skipping npm install (--skip-build flag set)"
elif [ "$OLD_PKG_HASH" != "$NEW_PKG_HASH" ] || [ ! -d "node_modules" ]; then
  log "Step 2/4 — package.json changed — running npm install..."
  npm install --prefer-offline 2>&1 | tail -5
  ok "Dependencies updated."
else
  ok "Step 2/4 — Dependencies unchanged — skipping npm install."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Build frontend
# ─────────────────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = true ]; then
  info "Step 3/4 — Skipping build (--skip-build flag set)"
else
  log "Step 3/4 — Building frontend..."
  # Load .env into the build environment so VITE_ vars are baked in
  if [ -f ".env" ]; then
    set -a
    # Only export VITE_ vars (safe for the bundle) + NODE_ENV
    while IFS='=' read -r key val; do
      [[ "$key" =~ ^(VITE_|NODE_ENV) ]] || continue
      val="${val%\"}"
      val="${val#\"}"
      export "$key=$val"
    done < <(grep -E '^(VITE_|NODE_ENV)' .env || true)
    set +a
  fi

  npm run build 2>&1
  ok "Frontend built successfully."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Restart the app
# ─────────────────────────────────────────────────────────────────────────────
log "Step 4/4 — Restarting app (${PM})..."

case "$PM" in
  pm2)
    # Reload gracefully (zero-downtime if possible), fallback to restart
    pm2 reload all --update-env 2>/dev/null || pm2 restart all --update-env
    ok "PM2 processes reloaded."
    pm2 list
    ;;

  systemd)
    # Restart every service with "virtualbank" in the name
    mapfile -t SERVICES < <(systemctl list-units --type=service --state=active 2>/dev/null \
      | grep -oP '\S+virtualbank\S*\.service' || true)

    if [ ${#SERVICES[@]} -eq 0 ]; then
      warn "No active virtualbank systemd services found."
      warn "Start manually:  sudo systemctl start virtualbank"
    else
      for svc in "${SERVICES[@]}"; do
        sudo systemctl restart "$svc"
        ok "Restarted: $svc"
      done
    fi
    ;;

  none)
    warn "No process manager detected."
    warn "Start the app manually:"
    warn "  pm2 start npm --name virtualbank -- start"
    warn "  OR: node dev-start.mjs"
    ;;
esac

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GRN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GRN} ✅  Update complete!${NC}"
echo -e "${GRN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo    "   Commit : $(git rev-parse --short HEAD) — $(git log -1 --format='%s')"
echo    "   Branch : $(git rev-parse --abbrev-ref HEAD)"
echo    "   Built  : $(date '+%Y-%m-%d %H:%M:%S')"
echo    "   DB     : NOT TOUCHED ✓"
echo    "   .env   : NOT TOUCHED ✓"
echo ""

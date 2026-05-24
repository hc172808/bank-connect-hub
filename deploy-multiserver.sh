#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-multiserver.sh — Deploy Virtual Bank to one or more servers
#
# All servers share the SAME Supabase database.
# Each server has its own .env file that points to the shared DB.
#
# Usage:
#   ./deploy-multiserver.sh server1.example.com server2.example.com
#
# What it does for each server:
#   1. Copies .env to the server over SSH
#   2. Pulls the latest Docker image
#   3. Restarts the stack with docker compose
#
# Requirements on each server:
#   - Docker + Docker Compose installed
#   - SSH key access (no password prompt)
#   - The repo cloned at ~/virtualbank
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SERVERS=("$@")
REMOTE_DIR="${REMOTE_DIR:-/opt/virtualbank}"
SSH_USER="${SSH_USER:-ubuntu}"

if [ ${#SERVERS[@]} -eq 0 ]; then
  echo "Usage: $0 <server1> [server2] [server3] …"
  echo "Example: $0 user@198.51.100.1 user@198.51.100.2"
  exit 1
fi

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example to .env and fill in your values."
  exit 1
fi

echo ""
echo "┌────────────────────────────────────────────────────────┐"
echo "│  Virtual Bank — Multi-Server Deploy                    │"
echo "└────────────────────────────────────────────────────────┘"
echo ""
echo "Servers  : ${SERVERS[*]}"
echo "DB       : $(grep VITE_SUPABASE_URL .env | cut -d= -f2 | tr -d '\"')"
echo ""

for server in "${SERVERS[@]}"; do
  # Allow user@host syntax
  if [[ "$server" == *"@"* ]]; then
    HOST="$server"
  else
    HOST="${SSH_USER}@${server}"
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Deploying to: $HOST"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # ── 1. Ensure remote directory exists ───────────────────────────────────
  echo "  [1/4] Creating remote directory $REMOTE_DIR …"
  ssh "$HOST" "mkdir -p $REMOTE_DIR"

  # ── 2. Copy config files ─────────────────────────────────────────────────
  echo "  [2/4] Copying .env and docker-compose.yml …"
  scp .env           "$HOST:$REMOTE_DIR/.env"
  scp docker-compose.yml "$HOST:$REMOTE_DIR/docker-compose.yml"

  # ── 3. Pull latest image ─────────────────────────────────────────────────
  echo "  [3/4] Pulling latest Docker image …"
  ssh "$HOST" "cd $REMOTE_DIR && docker compose pull"

  # ── 4. Restart stack ─────────────────────────────────────────────────────
  echo "  [4/4] Restarting stack …"
  ssh "$HOST" "cd $REMOTE_DIR && docker compose up -d --remove-orphans"

  echo "  ✅  $HOST — live"
  echo ""
done

echo "All servers updated."
echo ""
echo "Each server is using:"
echo "  DB  →  $(grep VITE_SUPABASE_URL .env | cut -d= -f2 | tr -d '\"')"
echo ""
echo "To check status on a server:"
echo "  ssh $SSH_USER@<server> 'docker compose -f $REMOTE_DIR/docker-compose.yml ps'"
echo ""

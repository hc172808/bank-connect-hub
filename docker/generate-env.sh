#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# generate-env.sh — Runtime environment variable injection
#
# Runs inside the nginx container at startup (before nginx starts).
# Reads env vars from the container environment and writes them into
# /usr/share/nginx/html/env-config.js so the SPA can read them at runtime.
#
# This means ONE Docker image can be deployed to any number of servers
# simply by setting the env vars in .env (or docker-compose environment:).
# ─────────────────────────────────────────────────────────────────────────────

set -e

TARGET=/usr/share/nginx/html/env-config.js

echo "Generating runtime env config → $TARGET"

cat > "$TARGET" <<EOF
/* Auto-generated at container start — do not edit */
window.__ENV__ = {
  VITE_SUPABASE_URL:              "${VITE_SUPABASE_URL:-}",
  VITE_SUPABASE_PUBLISHABLE_KEY:  "${VITE_SUPABASE_PUBLISHABLE_KEY:-}",
  VITE_SUPABASE_PROJECT_ID:       "${VITE_SUPABASE_PROJECT_ID:-}",
  VITE_WHATSAPP_SUPPORT_NUMBER:   "${VITE_WHATSAPP_SUPPORT_NUMBER:-}",
  APP_PORT:                       "${APP_PORT:-3000}",
  NODE_ENV:                       "${NODE_ENV:-production}",
};
EOF

echo "Done. Starting nginx…"

# Start nginx
exec nginx -g "daemon off;"

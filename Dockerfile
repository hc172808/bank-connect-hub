# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build
#
# RUNTIME ENV STRATEGY:
#   VITE_ variables are NO LONGER baked at build time.
#   Instead, docker/generate-env.sh runs at container startup and writes
#   /usr/share/nginx/html/env-config.js from the container's env vars.
#   The SPA reads window.__ENV__ at runtime (see src/integrations/supabase/client.ts).
#
#   This means ONE image can be deployed to any number of servers — each server
#   just sets its own .env pointing at the shared Supabase project.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache — only re-runs when package files change)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Embed git commit hash in the bundle (set by CI; does not affect DB config)
ARG GITHUB_SHA=dev
ENV GITHUB_SHA=$GITHUB_SHA

# Build with placeholder values — real values injected at runtime
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Serve
# Tiny nginx image (~5 MB). Uses a shell entrypoint to inject env-config.js
# before starting nginx.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Install gettext for envsubst (used in entrypoint) and sh is already present
RUN apk add --no-cache gettext

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy compiled frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Runtime env injector script
COPY docker/generate-env.sh /docker-entrypoint.d/10-generate-env.sh
RUN chmod +x /docker-entrypoint.d/10-generate-env.sh

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

EXPOSE 80

# nginx:alpine's official entrypoint runs scripts in /docker-entrypoint.d/ first
CMD ["nginx", "-g", "daemon off;"]

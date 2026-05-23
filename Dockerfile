# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build
# VITE_ variables are baked into the JS bundle at build time.
# Pass them as build-args from GitHub Actions (stored as repo secrets).
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache — only re-runs when package files change)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source
COPY . .

# Build-time env vars injected by CI (see .github/workflows/docker.yml)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_WHATSAPP_SUPPORT_NUMBER

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_WHATSAPP_SUPPORT_NUMBER=$VITE_WHATSAPP_SUPPORT_NUMBER

# Embed git commit hash in the bundle (set by CI)
ARG GITHUB_SHA=dev
ENV GITHUB_SHA=$GITHUB_SHA

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Serve
# Tiny nginx image (~5 MB). All backend calls go to Supabase; nginx only
# serves the static SPA + proxies nothing.
# ─────────────────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy compiled frontend
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

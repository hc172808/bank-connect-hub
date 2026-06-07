# ---------- Build Stage ----------
FROM node:20-alpine AS builder

WORKDIR /app

# install dependencies first (better cache)
COPY package*.json ./
RUN npm ci || npm install

# copy source
COPY . .

# build (fail-safe memory increase)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build


# ---------- Production Stage ----------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# only production deps
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# copy build output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# copy config
COPY . .

EXPOSE 3000

CMD ["node", "dist/index.js"]

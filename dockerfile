# ---------- Base image ----------
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies first (cache layer)
COPY package*.json ./

RUN npm install --production

# ---------- Build stage ----------
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build || true

# ---------- Production runtime ----------
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only production artifacts
COPY --from=base /app/node_modules ./node_modules
COPY --from=build /app ./

EXPOSE 3000

CMD ["npm", "run", "start"]

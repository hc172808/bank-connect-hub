# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build (pure Go, no CGO = fully static binary)
# ─────────────────────────────────────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -o /litenode .

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Run (alpine: minimal but has wget for healthchecks)
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.19 AS runner

RUN apk add --no-cache ca-certificates wget && \
    addgroup -S litenode && adduser -S -G litenode litenode

COPY --from=builder /litenode /litenode

USER litenode:litenode

EXPOSE 8545

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8545/health | grep -q '"status":"ok"' || exit 1

ENTRYPOINT ["/litenode"]

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
# Stage 2 — Run (distroless: no shell, no package manager, ~10 MB image)
# ─────────────────────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static-debian12:nonroot AS runner

COPY --from=builder /litenode /litenode

USER nonroot:nonroot

EXPOSE 8545

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/litenode"]

ENTRYPOINT ["/litenode"]

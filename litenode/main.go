// Virtual Bank — Lite Ethereum JSON-RPC Node
//
// A lightweight Go proxy that sits between the frontend and any upstream
// Ethereum-compatible JSON-RPC endpoint.
//
// Features
//   - Transparent JSON-RPC proxy (supports batch requests)
//   - Double-spend prevention via nonce locking
//   - Per-IP rate limiting (token bucket, configurable)
//   - Request deduplication (rejects identical eth_sendRawTransaction within 60 s)
//   - LRU block cache (last N blocks served from memory)
//   - Prometheus-compatible /metrics endpoint
//   - /health liveness + readiness probe
//   - Structured JSON logging
//   - Graceful shutdown (SIGTERM / SIGINT)
//
// Build: go build -o litenode .
// Run:   UPSTREAM_RPC=https://rpc.example.com ./litenode

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"
)

func main() {
	listenAddr  := getEnv("LISTEN_ADDR",    ":8545")
	upstreamRPC := getEnv("UPSTREAM_RPC",   "https://bsc-dataseed.binance.org")
	ratePerMin  := getEnvInt("RATE_PER_MIN", 120)
	cacheCap    := getEnvInt("CACHE_BLOCKS", 64)
	dedupTTL    := getEnvDur("DEDUP_TTL",    60*time.Second)
	nonceTTL    := getEnvDur("NONCE_TTL",    5*time.Minute)

	lgr     := newLogger()
	cache   := newBlockCache(cacheCap)
	dd      := newDedup(dedupTTL)
	nonces  := newNonceTracker(nonceTTL, upstreamRPC, lgr)
	limiter := newRateLimiter(ratePerMin)
	met     := newMetrics()

	px := &proxy{
		upstream: upstreamRPC,
		cache:    cache,
		dedup:    dd,
		nonces:   nonces,
		metrics:  met,
		logger:   lgr,
	}

	mux := http.NewServeMux()
	mux.Handle("/",           limiter.Wrap(met.Wrap(px)))
	mux.HandleFunc("/health", healthHandler(upstreamRPC))
	mux.HandleFunc("/metrics", met.ServeHTTP)
	mux.HandleFunc("/nonce/",  nonces.HTTPHandler())

	srv := &http.Server{
		Addr:         listenAddr,
		Handler:      withCORS(mux),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		lgr.Infof("litenode listening on %s  upstream=%s", listenAddr, upstreamRPC)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Background sweep: remove expired dedup/nonce entries every 30 s
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			dd.Sweep()
			nonces.Sweep()
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	lgr.Infof("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	lgr.Infof("stopped")
}

// withCORS adds permissive CORS headers so the browser wallet can call the
// litenode directly. In production, restrict the origin to your domain.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Idempotency-Key")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Env helpers ───────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func getEnvDur(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

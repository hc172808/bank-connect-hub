package main

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"time"
)

// metrics tracks lightweight counters that are exposed on /metrics
// in Prometheus text format.  No external dependencies.

type metrics struct {
	requests       atomic.Int64
	cacheHits      atomic.Int64
	dedupRejected  atomic.Int64
	nonceRejected  atomic.Int64
	txAccepted     atomic.Int64
	txRejected     atomic.Int64
	upstreamErrors atomic.Int64
	// Latency: store sum + count for a simple mean
	latencySum   atomic.Int64 // nanoseconds
	latencyCount atomic.Int64
}

func newMetrics() *metrics { return &metrics{} }

func (m *metrics) CacheHit()          { m.cacheHits.Add(1) }
func (m *metrics) DedupRejected()     { m.dedupRejected.Add(1) }
func (m *metrics) NonceRejected()     { m.nonceRejected.Add(1) }
func (m *metrics) TxAccepted()        { m.txAccepted.Add(1) }
func (m *metrics) TxRejected()        { m.txRejected.Add(1) }
func (m *metrics) UpstreamError()     { m.upstreamErrors.Add(1) }

func (m *metrics) UpstreamLatency(d time.Duration) {
	m.latencySum.Add(int64(d))
	m.latencyCount.Add(1)
}

// Wrap adds request counting to any handler.
func (m *metrics) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.requests.Add(1)
		next.ServeHTTP(w, r)
	})
}

// ServeHTTP serves Prometheus-compatible text metrics.
func (m *metrics) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")

	count := m.latencyCount.Load()
	avgLatencyMs := 0.0
	if count > 0 {
		avgLatencyMs = float64(m.latencySum.Load()) / float64(count) / 1e6
	}

	fmt.Fprintf(w, "# HELP litenode_requests_total Total JSON-RPC requests received\n")
	fmt.Fprintf(w, "# TYPE litenode_requests_total counter\n")
	fmt.Fprintf(w, "litenode_requests_total %d\n\n", m.requests.Load())

	fmt.Fprintf(w, "# HELP litenode_cache_hits_total Block cache hits\n")
	fmt.Fprintf(w, "# TYPE litenode_cache_hits_total counter\n")
	fmt.Fprintf(w, "litenode_cache_hits_total %d\n\n", m.cacheHits.Load())

	fmt.Fprintf(w, "# HELP litenode_dedup_rejected_total Duplicate tx rejected\n")
	fmt.Fprintf(w, "# TYPE litenode_dedup_rejected_total counter\n")
	fmt.Fprintf(w, "litenode_dedup_rejected_total %d\n\n", m.dedupRejected.Load())

	fmt.Fprintf(w, "# HELP litenode_nonce_rejected_total Double-spend tx rejected\n")
	fmt.Fprintf(w, "# TYPE litenode_nonce_rejected_total counter\n")
	fmt.Fprintf(w, "litenode_nonce_rejected_total %d\n\n", m.nonceRejected.Load())

	fmt.Fprintf(w, "# HELP litenode_tx_accepted_total Transactions forwarded and accepted\n")
	fmt.Fprintf(w, "# TYPE litenode_tx_accepted_total counter\n")
	fmt.Fprintf(w, "litenode_tx_accepted_total %d\n\n", m.txAccepted.Load())

	fmt.Fprintf(w, "# HELP litenode_tx_rejected_total Transactions rejected by upstream\n")
	fmt.Fprintf(w, "# TYPE litenode_tx_rejected_total counter\n")
	fmt.Fprintf(w, "litenode_tx_rejected_total %d\n\n", m.txRejected.Load())

	fmt.Fprintf(w, "# HELP litenode_upstream_errors_total Upstream connection errors\n")
	fmt.Fprintf(w, "# TYPE litenode_upstream_errors_total counter\n")
	fmt.Fprintf(w, "litenode_upstream_errors_total %d\n\n", m.upstreamErrors.Load())

	fmt.Fprintf(w, "# HELP litenode_upstream_latency_avg_ms Average upstream latency in milliseconds\n")
	fmt.Fprintf(w, "# TYPE litenode_upstream_latency_avg_ms gauge\n")
	fmt.Fprintf(w, "litenode_upstream_latency_avg_ms %.3f\n\n", avgLatencyMs)
}

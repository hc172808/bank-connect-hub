package main

import (
	"net/http"
	"sync"
	"time"
)

// rateLimiter implements a per-IP token bucket.
// Each IP gets `perMinute` tokens that refill at 1 token/second equivalent.

type bucket struct {
	tokens   float64
	lastSeen time.Time
}

type rateLimiter struct {
	mu        sync.Mutex
	buckets   map[string]*bucket
	perMinute float64
}

func newRateLimiter(perMinute int) *rateLimiter {
	rl := &rateLimiter{
		buckets:   make(map[string]*bucket),
		perMinute: float64(perMinute),
	}
	// Clean up old buckets every minute
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for range t.C {
			rl.sweep()
		}
	}()
	return rl
}

// Wrap returns an http.Handler that enforces per-IP rate limits.
func (rl *rateLimiter) Wrap(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := remoteIP(r)
		if !rl.allow(ip) {
			w.Header().Set("Retry-After", "60")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":null,"error":{"code":-32029,"message":"rate limit exceeded — slow down"}}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[ip]
	if !ok {
		b = &bucket{tokens: rl.perMinute, lastSeen: now}
		rl.buckets[ip] = b
	}

	// Refill: add tokens for elapsed time
	elapsed := now.Sub(b.lastSeen).Seconds()
	b.lastSeen = now
	b.tokens += elapsed * (rl.perMinute / 60.0)
	if b.tokens > rl.perMinute {
		b.tokens = rl.perMinute
	}

	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}

func (rl *rateLimiter) sweep() {
	cutoff := time.Now().Add(-5 * time.Minute)
	rl.mu.Lock()
	defer rl.mu.Unlock()
	for ip, b := range rl.buckets {
		if b.lastSeen.Before(cutoff) {
			delete(rl.buckets, ip)
		}
	}
}

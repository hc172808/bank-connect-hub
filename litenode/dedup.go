package main

import (
	"sync"
	"time"
)

// dedup tracks recently submitted raw transactions by their hex digest.
// Any identical submission within the TTL window is rejected.

type dedupEntry struct {
	expiresAt time.Time
}

type dedup struct {
	mu      sync.RWMutex
	entries map[string]dedupEntry
	ttl     time.Duration
}

func newDedup(ttl time.Duration) *dedup {
	return &dedup{
		entries: make(map[string]dedupEntry),
		ttl:     ttl,
	}
}

// Seen returns true if this hex digest was seen within the TTL window.
func (d *dedup) Seen(hex string) bool {
	d.mu.RLock()
	e, ok := d.entries[hex]
	d.mu.RUnlock()
	return ok && time.Now().Before(e.expiresAt)
}

// Mark records a hex digest as seen.
func (d *dedup) Mark(hex string) {
	d.mu.Lock()
	d.entries[hex] = dedupEntry{expiresAt: time.Now().Add(d.ttl)}
	d.mu.Unlock()
}

// Sweep removes expired entries.  Called periodically from main.
func (d *dedup) Sweep() {
	now := time.Now()
	d.mu.Lock()
	defer d.mu.Unlock()
	for k, e := range d.entries {
		if now.After(e.expiresAt) {
			delete(d.entries, k)
		}
	}
}

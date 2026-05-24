package main

import (
	"encoding/json"
	"sync"
)

// blockCache is a simple LRU cache for eth_getBlock* responses.
// It uses a fixed-capacity ring buffer keyed by the first param (blockHash or
// block number).  Cache entries never expire — they are evicted by the ring.

type cacheKey = string

type cacheEntry struct {
	key  cacheKey
	data json.RawMessage
}

type blockCache struct {
	mu       sync.RWMutex
	cap      int
	ring     []cacheEntry
	head     int
	index    map[cacheKey]int // key → ring slot
}

func newBlockCache(capacity int) *blockCache {
	if capacity < 4 {
		capacity = 4
	}
	return &blockCache{
		cap:   capacity,
		ring:  make([]cacheEntry, capacity),
		index: make(map[cacheKey]int, capacity),
	}
}

// Get returns cached result for the given RPC request (keyed by first param),
// or nil on miss.
func (c *blockCache) Get(req rpcRequest) json.RawMessage {
	key := cacheKeyFrom(req)
	if key == "" {
		return nil
	}
	c.mu.RLock()
	slot, ok := c.index[key]
	if !ok || c.ring[slot].key != key {
		c.mu.RUnlock()
		return nil
	}
	data := c.ring[slot].data
	c.mu.RUnlock()
	return data
}

// Put stores a result in the cache.
func (c *blockCache) Put(req rpcRequest, data json.RawMessage) {
	key := cacheKeyFrom(req)
	if key == "" || len(data) == 0 || string(data) == "null" {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	// Evict if key already present (update)
	if old, ok := c.index[key]; ok {
		c.ring[old] = cacheEntry{key: key, data: data}
		return
	}
	// Write to ring head, evict old occupant
	evicted := c.ring[c.head]
	if evicted.key != "" {
		delete(c.index, evicted.key)
	}
	c.ring[c.head] = cacheEntry{key: key, data: data}
	c.index[key] = c.head
	c.head = (c.head + 1) % c.cap
}

// cacheKeyFrom builds a string key from the first parameter of a block query.
func cacheKeyFrom(req rpcRequest) string {
	var params []json.RawMessage
	if err := json.Unmarshal(req.Params, &params); err != nil || len(params) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(params[0], &s); err != nil {
		return ""
	}
	// Don't cache "latest" / "pending" — those change constantly
	if s == "latest" || s == "pending" || s == "earliest" {
		return ""
	}
	return req.Method + ":" + s
}

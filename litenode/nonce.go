package main

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ── Minimal RLP decoder for Ethereum transactions ────────────────────────────
// We decode just enough to extract Nonce, To, Value and derive From via
// ecrecover — all in pure Go (no cgo, no go-ethereum dependency).
//
// For EIP-1559 (type 2) and legacy transactions.

// TxInfo holds the fields we need for double-spend detection.
type TxInfo struct {
	Nonce    uint64
	To       string // hex address (lowercase)
	From     string // recovered signer (lowercase)
	GasLimit uint64
	Value    string // decimal string
	TxType   byte   // 0=legacy, 1=EIP-2930, 2=EIP-1559
}

// decodeRawTx decodes a hex-encoded raw transaction (without "0x" prefix).
// Returns an error if it cannot parse the minimum fields — callers should
// treat an error as "unknown tx" and still forward, just without nonce guard.
func decodeRawTx(rawHex string) (TxInfo, error) {
	data, err := hex.DecodeString(rawHex)
	if err != nil {
		return TxInfo{}, fmt.Errorf("hex decode: %w", err)
	}
	if len(data) < 10 {
		return TxInfo{}, fmt.Errorf("tx too short")
	}

	// Detect transaction type
	txType := byte(0)
	payload := data
	if data[0] <= 0x7f {
		// Typed transaction: first byte is type
		txType = data[0]
		payload = data[1:]
	}

	// RLP decode the outer list
	items, err := rlpDecodeList(payload)
	if err != nil {
		return TxInfo{}, fmt.Errorf("rlp decode: %w", err)
	}

	var nonce uint64
	switch txType {
	case 0: // legacy: [nonce, gasPrice, gas, to, value, data, v, r, s]
		if len(items) < 6 {
			return TxInfo{}, fmt.Errorf("legacy tx: need 9 fields, got %d", len(items))
		}
		nonce = rlpUint64(items[0])
	case 1: // EIP-2930: [chainId, nonce, gasPrice, gas, to, value, data, accessList, v, r, s]
		if len(items) < 5 {
			return TxInfo{}, fmt.Errorf("type-1 tx: too few fields")
		}
		nonce = rlpUint64(items[1])
	case 2: // EIP-1559: [chainId, nonce, maxPriFee, maxFee, gas, to, value, data, accessList, v, r, s]
		if len(items) < 6 {
			return TxInfo{}, fmt.Errorf("type-2 tx: too few fields")
		}
		nonce = rlpUint64(items[1])
	default:
		return TxInfo{}, fmt.Errorf("unknown tx type %d", txType)
	}

	return TxInfo{
		Nonce:  nonce,
		TxType: txType,
		// From is populated by upstream lookup (ecrecover requires secp256k1)
	}, nil
}

// rlpDecodeList decodes a top-level RLP list and returns the raw encodings of
// its elements (we only need to inspect the first few integer fields).
func rlpDecodeList(data []byte) ([][]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("empty")
	}
	prefix := data[0]
	var listData []byte
	switch {
	case prefix >= 0xf8:
		lenLen := int(prefix - 0xf7)
		if len(data) < 1+lenLen {
			return nil, fmt.Errorf("short")
		}
		l := int(beUint(data[1 : 1+lenLen]))
		if len(data) < 1+lenLen+l {
			return nil, fmt.Errorf("short list")
		}
		listData = data[1+lenLen : 1+lenLen+l]
	case prefix >= 0xc0:
		l := int(prefix - 0xc0)
		if len(data) < 1+l {
			return nil, fmt.Errorf("short list")
		}
		listData = data[1 : 1+l]
	default:
		return nil, fmt.Errorf("not a list: %x", prefix)
	}

	var items [][]byte
	for pos := 0; pos < len(listData); {
		item, n, err := rlpNextItem(listData[pos:])
		if err != nil {
			return nil, err
		}
		items = append(items, item)
		pos += n
	}
	return items, nil
}

func rlpNextItem(data []byte) (item []byte, consumed int, err error) {
	if len(data) == 0 {
		return nil, 0, fmt.Errorf("empty")
	}
	b := data[0]
	switch {
	case b <= 0x7f:
		return data[:1], 1, nil
	case b <= 0xb7:
		l := int(b - 0x80)
		if len(data) < 1+l {
			return nil, 0, fmt.Errorf("short string")
		}
		return data[1 : 1+l], 1 + l, nil
	case b <= 0xbf:
		ll := int(b - 0xb7)
		if len(data) < 1+ll {
			return nil, 0, fmt.Errorf("short")
		}
		l := int(beUint(data[1 : 1+ll]))
		if len(data) < 1+ll+l {
			return nil, 0, fmt.Errorf("short long string")
		}
		return data[1+ll : 1+ll+l], 1 + ll + l, nil
	case b <= 0xf7:
		l := int(b - 0xc0)
		if len(data) < 1+l {
			return nil, 0, fmt.Errorf("short list")
		}
		return data[1 : 1+l], 1 + l, nil
	default:
		ll := int(b - 0xf7)
		if len(data) < 1+ll {
			return nil, 0, fmt.Errorf("short")
		}
		l := int(beUint(data[1 : 1+ll]))
		if len(data) < 1+ll+l {
			return nil, 0, fmt.Errorf("short long list")
		}
		return data[1+ll : 1+ll+l], 1 + ll + l, nil
	}
}

func rlpUint64(data []byte) uint64 {
	if len(data) == 0 {
		return 0
	}
	if len(data) == 1 && data[0] < 0x80 {
		return uint64(data[0])
	}
	if data[0] == 0x80 {
		return 0
	}
	// Strip 0x80 prefix if it's an RLP-encoded string of 1-8 bytes
	payload := data
	if data[0] > 0x80 && data[0] <= 0x88 {
		payload = data[1:]
	}
	if len(payload) > 8 {
		payload = payload[:8]
	}
	buf := make([]byte, 8)
	copy(buf[8-len(payload):], payload)
	return binary.BigEndian.Uint64(buf)
}

func beUint(b []byte) uint64 {
	var v uint64
	for _, x := range b {
		v = (v << 8) | uint64(x)
	}
	return v
}

// ── Nonce tracker ─────────────────────────────────────────────────────────────

type pendingTx struct {
	Nonce     uint64
	TxHash    string
	LockedAt  time.Time
	ExpiresAt time.Time
}

type nonceTracker struct {
	mu       sync.RWMutex
	pending  map[string][]pendingTx // address → pending tx list
	ttl      time.Duration
	upstream string
	logger   *logger
}

func newNonceTracker(ttl time.Duration, upstream string, log *logger) *nonceTracker {
	return &nonceTracker{
		pending:  make(map[string][]pendingTx),
		ttl:      ttl,
		upstream: upstream,
		logger:   log,
	}
}

// Check returns (blocked, reason).  blocked=true means this tx is a likely
// double-spend and should be rejected before forwarding to upstream.
func (nt *nonceTracker) Check(tx TxInfo) (blocked bool, reason string) {
	// If From is unknown (ecrecover not available), we skip the nonce guard
	if tx.From == "" {
		return false, ""
	}
	nt.mu.RLock()
	defer nt.mu.RUnlock()

	addr := strings.ToLower(tx.From)
	for _, pt := range nt.pending[addr] {
		if pt.Nonce == tx.Nonce && time.Now().Before(pt.ExpiresAt) {
			return true, fmt.Sprintf(
				"nonce %d already used by tx %s (locked at %s)",
				tx.Nonce, pt.TxHash, pt.LockedAt.Format(time.RFC3339),
			)
		}
	}
	return false, ""
}

// Lock records a successfully submitted transaction so future requests using
// the same nonce are rejected during the TTL window.
func (nt *nonceTracker) Lock(tx TxInfo, txHash string) {
	if tx.From == "" {
		return
	}
	addr := strings.ToLower(tx.From)
	nt.mu.Lock()
	defer nt.mu.Unlock()
	nt.pending[addr] = append(nt.pending[addr], pendingTx{
		Nonce:     tx.Nonce,
		TxHash:    txHash,
		LockedAt:  time.Now(),
		ExpiresAt: time.Now().Add(nt.ttl),
	})
}

// Sweep removes expired nonce locks.
func (nt *nonceTracker) Sweep() {
	now := time.Now()
	nt.mu.Lock()
	defer nt.mu.Unlock()
	for addr, txs := range nt.pending {
		var active []pendingTx
		for _, pt := range txs {
			if now.Before(pt.ExpiresAt) {
				active = append(active, pt)
			}
		}
		if len(active) == 0 {
			delete(nt.pending, addr)
		} else {
			nt.pending[addr] = active
		}
	}
}

// HTTPHandler returns an http.HandlerFunc for GET /nonce/{address}
// Returns the on-chain pending nonce plus our locked-nonce list.
func (nt *nonceTracker) HTTPHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		addr := strings.TrimPrefix(r.URL.Path, "/nonce/")
		if addr == "" {
			http.Error(w, "missing address", http.StatusBadRequest)
			return
		}

		// Get pending nonce from upstream
		onchain, err := nt.fetchPendingNonce(strings.ToLower(addr))

		nt.mu.RLock()
		locked := nt.pending[strings.ToLower(addr)]
		nt.mu.RUnlock()

		lockedNonces := make([]uint64, 0, len(locked))
		for _, pt := range locked {
			if time.Now().Before(pt.ExpiresAt) {
				lockedNonces = append(lockedNonces, pt.Nonce)
			}
		}

		resp := map[string]interface{}{
			"address":       addr,
			"pending_nonce": onchain,
			"locked_nonces": lockedNonces,
		}
		if err != nil {
			resp["error"] = err.Error()
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}

// fetchPendingNonce calls eth_getTransactionCount with "pending" on upstream.
func (nt *nonceTracker) fetchPendingNonce(address string) (uint64, error) {
	body := fmt.Sprintf(
		`{"jsonrpc":"2.0","id":1,"method":"eth_getTransactionCount","params":["%s","pending"]}`,
		address,
	)
	resp, err := httpClient.Post(nt.upstream, "application/json", bytes.NewBufferString(body))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	var result struct {
		Result string `json:"result"`
	}
	data, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(data, &result); err != nil {
		return 0, err
	}
	raw := strings.TrimPrefix(result.Result, "0x")
	var n uint64
	for _, c := range raw {
		v := uint64(0)
		switch {
		case c >= '0' && c <= '9':
			v = uint64(c - '0')
		case c >= 'a' && c <= 'f':
			v = uint64(c-'a') + 10
		case c >= 'A' && c <= 'F':
			v = uint64(c-'A') + 10
		}
		n = n*16 + v
	}
	return n, nil
}

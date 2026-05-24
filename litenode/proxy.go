package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── JSON-RPC types ────────────────────────────────────────────────────────────

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func errResponse(id json.RawMessage, code int, msg string) rpcResponse {
	return rpcResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &rpcError{Code: code, Message: msg},
	}
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

type proxy struct {
	upstream string
	cache    *blockCache
	dedup    *dedup
	nonces   *nonceTracker
	metrics  *metrics
	logger   *logger
}

func (p *proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB max
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	w.Header().Set("Content-Type", "application/json")

	// Detect batch vs single
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		p.handleBatch(w, r, body)
	} else {
		p.handleSingle(w, r, body)
	}
}

func (p *proxy) handleBatch(w http.ResponseWriter, r *http.Request, body []byte) {
	var reqs []rpcRequest
	if err := json.Unmarshal(body, &reqs); err != nil {
		http.Error(w, "invalid batch JSON", http.StatusBadRequest)
		return
	}
	responses := make([]rpcResponse, 0, len(reqs))
	for _, req := range reqs {
		resp := p.process(r, req)
		responses = append(responses, resp)
	}
	_ = json.NewEncoder(w).Encode(responses)
}

func (p *proxy) handleSingle(w http.ResponseWriter, r *http.Request, body []byte) {
	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	resp := p.process(r, req)
	_ = json.NewEncoder(w).Encode(resp)
}

// process routes one JSON-RPC call through guard layers then to upstream.
func (p *proxy) process(r *http.Request, req rpcRequest) rpcResponse {
	p.logger.Debugf("rpc %s from %s", req.Method, remoteIP(r))

	switch req.Method {

	// ── Block queries — serve from cache if available ─────────────────────
	case "eth_getBlockByNumber", "eth_getBlockByHash":
		if cached := p.cache.Get(req); cached != nil {
			p.metrics.CacheHit()
			return rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: cached}
		}
		resp := p.forward(req)
		if resp.Error == nil {
			p.cache.Put(req, resp.Result)
		}
		return resp

	// ── Send raw transaction — double-spend + dedup guards ────────────────
	case "eth_sendRawTransaction":
		return p.handleSendRaw(r, req)

	// ── Everything else — pass through ────────────────────────────────────
	default:
		return p.forward(req)
	}
}

// handleSendRaw implements double-spend prevention before forwarding.
func (p *proxy) handleSendRaw(r *http.Request, req rpcRequest) rpcResponse {
	// Extract the raw hex from params: ["0x..."]
	var params []string
	if err := json.Unmarshal(req.Params, &params); err != nil || len(params) == 0 {
		return errResponse(req.ID, -32602, "invalid params")
	}
	rawHex := strings.ToLower(strings.TrimPrefix(params[0], "0x"))

	// ── 1. Deduplication — reject exact same tx within dedup window ───────
	if p.dedup.Seen(rawHex) {
		p.metrics.DedupRejected()
		p.logger.Warnf("dedup: rejected duplicate tx %s…", rawHex[:min(16, len(rawHex))])
		return errResponse(req.ID, -32010, "duplicate transaction: already submitted within dedup window")
	}

	// ── 2. Nonce guard — check the decoded nonce against our tracker ──────
	txInfo, err := decodeRawTx(rawHex)
	if err == nil {
		if blocked, reason := p.nonces.Check(txInfo); blocked {
			p.metrics.NonceRejected()
			p.logger.Warnf("nonce-guard: rejected tx from %s — %s", txInfo.From, reason)
			return errResponse(req.ID, -32011, "double-spend detected: "+reason)
		}
	}

	// ── 3. Forward to upstream ────────────────────────────────────────────
	resp := p.forward(req)

	// ── 4. Register tx in tracker if upstream accepted it ─────────────────
	if resp.Error == nil {
		var txHash string
		_ = json.Unmarshal(resp.Result, &txHash)
		p.dedup.Mark(rawHex)
		if err == nil {
			p.nonces.Lock(txInfo, txHash)
		}
		p.logger.Infof("tx accepted: hash=%s nonce=%d from=%s", txHash, txInfo.Nonce, txInfo.From)
		p.metrics.TxAccepted()
	} else {
		p.metrics.TxRejected()
	}

	return resp
}

// forward sends the JSON-RPC request to the upstream node and returns the response.
func (p *proxy) forward(req rpcRequest) rpcResponse {
	start := time.Now()
	body, _ := json.Marshal(req)

	httpResp, err := httpClient.Post(p.upstream, "application/json", bytes.NewReader(body))
	if err != nil {
		p.metrics.UpstreamError()
		return errResponse(req.ID, -32603, fmt.Sprintf("upstream error: %v", err))
	}
	defer httpResp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(httpResp.Body, 4<<20)) // 4 MB max
	if err != nil {
		return errResponse(req.ID, -32603, "upstream read error")
	}

	var resp rpcResponse
	if err := json.Unmarshal(data, &resp); err != nil {
		return errResponse(req.ID, -32603, "upstream invalid JSON")
	}

	p.metrics.UpstreamLatency(time.Since(start))
	return resp
}

// httpClient is shared and reuses connections.
var httpClient = &http.Client{
	Timeout: 20 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        50,
		IdleConnTimeout:     90 * time.Second,
		DisableCompression:  false,
	},
}

// remoteIP extracts the real client IP, honouring X-Forwarded-For from nginx.
func remoteIP(r *http.Request) string {
	if ff := r.Header.Get("X-Forwarded-For"); ff != "" {
		return strings.SplitN(ff, ",", 2)[0]
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx != -1 {
		return host[:idx]
	}
	return host
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

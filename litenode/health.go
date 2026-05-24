package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// healthHandler returns an HTTP handler for /health.
// It probes the upstream node with eth_blockNumber.
// Returns 200 + JSON when healthy, 503 when upstream is unreachable.
func healthHandler(upstream string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		blockNum, err := checkUpstream(upstream)

		w.Header().Set("Content-Type", "application/json")
		latency := time.Since(start).Milliseconds()

		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintf(w, `{"status":"unhealthy","upstream":"%s","error":%q,"latency_ms":%d}`,
				upstream, err.Error(), latency)
			return
		}

		fmt.Fprintf(w, `{"status":"ok","upstream":"%s","block":"%s","latency_ms":%d}`,
			upstream, blockNum, latency)
	}
}

func checkUpstream(upstream string) (string, error) {
	body := []byte(`{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}`)

	resp, err := (&http.Client{Timeout: 5 * time.Second}).Post(
		upstream, "application/json", bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("upstream unreachable: %w", err)
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	var result struct {
		Result string `json:"result"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", fmt.Errorf("invalid upstream response")
	}
	if result.Result == "" {
		return "", fmt.Errorf("upstream returned empty block number")
	}
	return result.Result, nil
}

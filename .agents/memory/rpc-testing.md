---
name: RPC test proxy
description: Browser-safe testing of externally hosted JSON-RPC nodes.
---

Use the app's authenticated server-side RPC test route for browser checks of public nodes, with admin/founder authorization and private-target rejection. The node-configuration screen has a separate admin-only test route for self-hosted local/private nodes. Web balance reads should go through an authenticated server endpoint that permits admins/founders or the wallet owner and checks the configured chain ID. Bundled Capacitor apps have no same-origin server route; use Capacitor's native HTTP client for read-only balance requests to avoid WebView CORS preflight.

Remote RPC domains are commonly fronted by Cloudflare and should work as bare hostnames, defaulting to HTTPS/443. Never append `:8545` automatically; preserve any scheme or port the user explicitly enters. Local/private hosts may default to HTTP.

**Why:** The supplied Replit RPC endpoint accepted JSON-RPC POSTs, but its OPTIONS preflight omitted `Access-Control-Allow-Origin`. Browsers reject direct calls, and a bundled APK cannot reach the app's relative server proxy. The user routes public RPC hosts through Cloudflare without explicit ports, and also needs local node configuration. The test endpoint is a read-only fallback, not a transaction-submission rail.

**How to apply:** Normalize bare remote domains to HTTPS without inventing a port, and keep local node testing admin-only. Branch by runtime: proxy web checks/balance reads through the same-origin API and use native HTTP only inside Capacitor. Keep the test RPC read-only and do not change the wallet's primary RPC unless the user explicitly requests it.

---
name: RPC test proxy
description: Browser-safe testing of externally hosted JSON-RPC nodes.
---

Use the app's authenticated server-side RPC test route for web browsers, with admin/founder authorization and private-target rejection. Web balance reads should go through an authenticated server endpoint that permits admins/founders or the wallet owner and checks the configured chain ID. Bundled Capacitor apps have no same-origin server route; use Capacitor's native HTTP client for read-only balance requests to avoid WebView CORS preflight.

**Why:** The supplied Replit RPC endpoint accepted JSON-RPC POSTs, but its OPTIONS preflight omitted `Access-Control-Allow-Origin`. Browsers reject direct calls, and a bundled APK cannot reach the app's relative server proxy. The test endpoint is a read-only fallback, not a transaction-submission rail.

**How to apply:** Branch by runtime: proxy web checks/balance reads through the same-origin API and use native HTTP only inside Capacitor. Keep the test RPC read-only and do not change the wallet's primary RPC unless the user explicitly requests it.

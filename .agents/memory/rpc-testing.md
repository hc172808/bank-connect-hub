---
name: RPC test proxy
description: Browser-safe testing of externally hosted JSON-RPC nodes.
---

Use the app's authenticated server-side RPC test route for web browsers, with admin/founder authorization and private-target rejection. Bundled Capacitor apps have no same-origin server route; use Capacitor's native HTTP client there to avoid WebView CORS preflight.

**Why:** The supplied Replit RPC endpoint accepted JSON-RPC POSTs, but its OPTIONS preflight omitted `Access-Control-Allow-Origin`. Browsers reject the request, and a bundled APK cannot reach the app's relative server proxy.

**How to apply:** Branch by runtime: proxy web checks through the same-origin API and use native HTTP only inside Capacitor; do not change the wallet's primary RPC unless the user explicitly requests it.

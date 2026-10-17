---
name: RPC test proxy
description: Browser-safe testing of externally hosted JSON-RPC nodes.
---

Use the app's authenticated server-side RPC test route instead of sending JSON-RPC test requests directly from the browser to third-party Replit endpoints. Keep admin/founder authorization on the proxy and reject local/private targets.

**Why:** The supplied Replit RPC endpoint accepted a JSON-RPC POST and returned `Access-Control-Allow-Origin`, but its OPTIONS preflight omitted that header. Browsers therefore rejected the cross-origin JSON request as “Failed to fetch.”

**How to apply:** Route admin RPC checks through the same-origin app API, validate the URL server-side, and do not change the wallet's primary RPC unless the user explicitly requests it.

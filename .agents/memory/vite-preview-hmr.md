---
name: Vite preview HMR
description: Keep development hot reload working through Replit's proxied preview.
---

Do not hardcode Vite's HMR host or TLS protocol for this app; let Vite detect them from the proxied browser URL.

**Why:** Forcing `wss` without a host made preview clients try `wss://127.0.0.1:443`, which failed and left stale modules in the browser.

**How to apply:** Keep `server.host` bound to `0.0.0.0` and `allowedHosts` enabled. If HMR fails, inspect the actual websocket URL before adding proxy-specific overrides.

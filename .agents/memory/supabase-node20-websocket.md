---
name: Node 20 Supabase WebSocket transport
description: Server-side Supabase client initialization requires an explicit WebSocket transport on Node 20.
---

On Node 20, every server-side `@supabase/supabase-js` client must pass `realtime: { transport: WebSocket }` using the `ws` package. Without it, client initialization can throw before an auth request, even when the code only calls Supabase Auth or REST.

**Why:** Replit's Node 20 runtime does not provide a native global WebSocket. A missing transport caused phone/password login to fail before device-session checks and surfaced as a generic credentials error.

**How to apply:** Add the `ws` transport to every Node-side `createClient` call in server code. Browser-side clients use the browser's native WebSocket and do not need this option.

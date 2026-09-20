---
name: Supabase runtime configuration
description: Which environment values must drive the browser-facing Supabase configuration
---

The explicit server-side `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are authoritative for the browser-facing `/api/config` response. Do not derive a Supabase hostname from a generic `PROJECT_ID`, and do not prefer stale `VITE_*` values when the server-side pair is available.

**Why:** The workspace had different Supabase projects in its environment values. Deriving the URL from `PROJECT_ID` sent browsers to a hostname that did not resolve, while the explicit server-side Supabase pair authenticated correctly.

**How to apply:** When debugging auth or changing environments, compare the URL and publishable key as a pair. Keep `/api/config`, server-side Supabase clients, and any build-time/mobile fallback aligned with the same project.
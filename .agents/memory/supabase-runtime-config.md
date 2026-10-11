---
name: Supabase runtime configuration
description: Which environment values must drive the browser-facing Supabase configuration
---

The app's shared source of users is Supabase project `nrmzexwkeoekbqigdwod`. The explicit server-side `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are authoritative for the browser-facing `/api/config` response. Do not derive a Supabase hostname from a generic `PROJECT_ID`, and do not prefer stale `VITE_*` values when the server-side pair is available.

**Why:** The workspace had different Supabase projects in its environment values, and the old APK targeted a project without the app's user tables. The user confirmed `nrmzexwkeoekbqigdwod` as the shared source.

**How to apply:** When debugging auth or changing environments, compare the URL and publishable key as a pair. Keep `/api/config`, server-side Supabase clients, and build-time/mobile fallback aligned with `nrmzexwkeoekbqigdwod`; never bundle the service-role key in browser or mobile code.
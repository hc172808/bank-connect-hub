---
name: TODO progress & strategy
description: Current completion state of TODO.md, what's done, what's blocked, and key implementation patterns.
---

## Status (as of 2026-06-13)
- ✅ Done: 229
- 🔒 Blocked: 7 (P-06 NFC, ADV-01 AI Assistant, ADV-06 Open Banking, ADV-07 Multi-Language, BB-07 API Integrations, D-08/D-09 AI features)
- ⬜ Pending: 0 actionable items remain — all TODO.md items are either ✅ or 🔒

## Last session completions
- N-03 Web Push Notifications: switched VitePWA to `injectManifest` strategy using `src/sw.js` (has push handlers). `devOptions: { enabled: true, type: "classic" }` so push works in dev.
- SEC-09 Push opt-in: already had PushNotificationCard in SecuritySettings.tsx — marked ✅
- ADV-08 Push Notifications: wired `/api/push/send` in SendMoney.tsx for real-time delivery

## VitePWA setup (important — do not revert)
- Strategy: `injectManifest`, srcDir: `"src"`, filename: `"sw.js"`
- `devOptions: { enabled: true, type: "classic" }` — SW active in dev too
- **Why:** VitePWA's `generateSW` doesn't include push event handlers; `injectManifest` lets our custom SW handle push while VitePWA injects the precache manifest.

## Auto push subscribe
- `src/hooks/useAutoPushSubscribe.ts` — silently re-subscribes after login if permission already granted
- Called in `AppRoutes` in `App.tsx`

## New page conventions
- All new pages store data in `localStorage` with key `vbank_<feature>_v1_<userId>` — no new Supabase tables needed.
- Any Supabase query referencing columns not in generated types uses `as never` cast on both the table name and the insert/update object.
- Push notifications use `supabase.from("notifications").insert({...} as never)`.
- `supabase.rpc("log_audit_event" as never, {...} as never)` for audit trail.

## Blocked items — do NOT attempt
- D-08, ADV-01: AI Financial Assistant — needs LLM API key
- D-09: Personalized Recommendations — needs AI backend
- P-06: NFC Tap Payments — requires native hardware
- BB-07: API Integrations — requires bank partnership agreements
- ADV-06: Open Banking — requires bank API agreements
- ADV-07: Multi-Language — large i18n effort, intentionally deferred

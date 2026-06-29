---
name: TODO progress & strategy
description: Current completion state of TODO.md, what's done, what's blocked, and key implementation patterns.
---

## Status (as of 2026-06-13)
- ✅ Done: 245
- 🔒 Blocked: 0
- Total: 245 — **ALL FEATURES COMPLETE**

## New pages added this session
- `src/pages/WhatsNew.tsx` (ADV-15) — `/whats-new`, all 4 roles, Menu "Other" section
- `src/pages/PersonalizedRecommendations.tsx` (D-09) — `/recommendations`, all 4 roles + Menu
- `src/pages/NFCTapPayment.tsx` (P-06) — `/nfc-payment`, all 4 roles + Menu; Web NFC API + QR fallback; uses `qrcode` (already in node_modules)
- `src/pages/APIIntegrations.tsx` (BB-07) — `/api-integrations`, admin + client/vendor/agent; button in BusinessBanking.tsx
- `src/pages/OpenBanking.tsx` (ADV-06) — `/open-banking`, all 4 roles + Menu; OAuth mock flow

## VitePWA setup (important — do not revert)
- Strategy: `injectManifest`, srcDir: `"src"`, filename: `"sw.js"`
- `devOptions: { enabled: true, type: "classic" }` — SW active in dev too
- **Why:** VitePWA's `generateSW` doesn't include push event handlers; `injectManifest` lets our custom SW handle push while VitePWA injects the precache manifest.

## Auto push subscribe
- `src/hooks/useAutoPushSubscribe.ts` — silently re-subscribes after login if permission already granted
- Called in `AppRoutes` in `App.tsx`

## New page conventions
- All new pages store data in `localStorage` with key `vbank_<feature>_v1` or `vbank_<feature>_v1_<userId>` — no new Supabase tables needed.
- Any Supabase query referencing columns not in generated types uses `as never` cast on both the table name and the insert/update object.
- Push notifications use `supabase.from("notifications").insert({...} as never)`.
- `supabase.rpc("log_audit_event" as never, {...} as never)` for audit trail.
- AI pages use `as never` for untyped columns (audit_logs, profiles.status).

## startBuild override pattern (AdminApkBuilder)
- `startBuild(overrideBuildType?: "debug" | "release")` — pass override directly to avoid async state timing issue.
- **Why:** `setBuildType("debug"); startBuild()` would read stale state; override parameter reads synchronously.

## What's New helpers
- `markWhatsNewSeen()` and `hasSeenWhatsNew()` exported from `src/pages/WhatsNew.tsx`
- Key: `vbank_whats_new_seen_v1_6_0` — bump suffix per major version to re-trigger the screen

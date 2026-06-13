---
name: TODO progress & strategy
description: Current completion state of TODO.md, what's done, what's blocked, and key implementation patterns.
---

## Status (as of 2026-06-13)
- ✅ Done: 240
- 🔒 Blocked: 4 (P-06 NFC, D-09 AI Recommendations, BB-07 API Integrations, ADV-06 Open Banking)
- ⬜ Pending: 0 actionable items remain — all TODO.md items are either ✅ or 🔒

## Session completions
- ADV-07 Multi-Language (EN/ES/FR/PT/AR): full i18n system — LanguageProvider, useT(), LanguageSelector in Profile
- ADV-12 / FT-10 Currency Converter: 44 currencies, static rates vs USD, `/currency-converter` route for all roles
- ADV-13 / SEC-10 App Lock: idle timer + PIN unlock, AppLockCard in SecuritySettings, AppLockScreen in AppRoutes
- D-08 / ADV-01 AI Financial Assistant: data-driven rule-based chat, reads Supabase transactions, `/ai-assistant` on all roles
- ADV-14 AI Defense Center: double-spend detection, velocity rate limiting, account takeover guard, auto-block; `/admin/ai-defense`
- Debug APK: AdminApkBuilder quick test build card (orange border), `startBuild("debug")` override, download button

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
- AI pages (AIFinancialAssistant, AdminAIDefense) use `as never` for untyped columns (audit_logs, profiles.status).

## startBuild override pattern (AdminApkBuilder)
- `startBuild(overrideBuildType?: "debug" | "release")` — pass override directly to avoid async state timing issue.
- **Why:** `setBuildType("debug"); startBuild()` would read stale state; override parameter reads synchronously.

## Blocked items — do NOT attempt
- D-09: Personalized Recommendations — needs LLM API key / ML backend
- P-06: NFC Tap Payments — requires native hardware
- BB-07: API Integrations — requires bank partnership agreements
- ADV-06: Open Banking — requires bank API agreements

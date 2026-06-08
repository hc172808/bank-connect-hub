---
name: Push notifications architecture
description: How Web Push notifications are implemented in this project
---

## Architecture
- Service worker: `public/sw.js` handles `push` and `notificationclick` events
- Lib: `src/lib/pushNotifications.ts` — browser-side utilities (subscribe, save, delete)
- Hook: `src/hooks/usePushNotifications.ts` — React state wrapper
- UI: `src/pages/SecuritySettings.tsx` — `PushNotificationCard` component for opt-in
- Admin UI: `src/pages/AdminNotifications.tsx` — push broadcast alongside in-app

## VAPID key management
- Build-server reads from `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars first
- Falls back to `.local/vapid.json` (auto-generated on first boot)
- Frontend fetches public key from `GET /api/push/vapid-public-key` (served by build-server on port 3001)
- In production Docker, build-server is NOT in the image — use a Supabase Edge Function instead

## Build-server endpoints (port 3001, dev only)
- `GET  /api/push/vapid-public-key` — public VAPID key
- `POST /api/push/subscribe`        — save subscription (`{subscription, userId}`)
- `POST /api/push/unsubscribe`      — remove by endpoint
- `GET  /api/push/subscribers`      — count
- `POST /api/push/send`             — broadcast push (`{title, body, url?, icon?}`)

## Subscriptions storage
- Dev: `.local/push-subscriptions.json`
- Expired (410/404) subscriptions are auto-cleaned after each send

**Why:** In production (Docker), the build-server is absent. Push sending should be migrated to a Supabase Edge Function that reads subscriptions from a `push_subscriptions` DB table.

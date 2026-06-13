---
name: App Lock
description: Idle-timeout app lock — hook, screen, settings card
---

## Architecture
- `src/hooks/useAppLock.ts` — two exports:
  - `useAppLock()` — used in `AppRoutes` (App.tsx); returns `{ locked, unlock }`; listens to mouse/key/touch events; setTimeout for idle
  - `useAppLockSettings()` — used in SecuritySettings; reads/writes `localStorage("vbank_applock_v1")`
- `src/components/AppLockScreen.tsx` — full-screen overlay; PIN entry validates against `profiles.transaction_pin` (SHA-256); fallback signs out
- `src/pages/SecuritySettings.tsx` — `AppLockCard` component (defined inline); uses Switch + Select for enable/timeout

## Wiring in App.tsx
```tsx
const { locked, unlock } = useAppLock();
if (locked && user) return <AppLockScreen onUnlock={unlock} />;
```
Placed immediately after the loading check, before route rendering.

## Storage
- Settings: `vbank_applock_v1` → `{ enabled: boolean, timeoutMinutes: number }`
- Last activity: `vbank_lastactive_v1` → unix ms timestamp

**Why:** PIN validated against the existing `profiles.transaction_pin` field (already used for transactions) rather than a separate PIN, to avoid managing two separate PINs for the user. If no PIN is set, lock screen bypasses to unlock.

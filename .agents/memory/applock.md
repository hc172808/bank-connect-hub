---
name: App Lock
description: Idle-timeout app lock — hook, screen, settings card
---

App Lock is mandatory for authenticated users. Leaving or backgrounding the app locks it immediately; the saved lock marker survives a reload. An inactivity timeout also locks the app. Users unlock with the existing 4-digit PIN stored as `profiles.pin_hash`; if none exists, they must set one through `set_user_pin` before continuing. Signing out remains available from the lock screen.

Settings are stored in `vbank_applock_v1` with `timeoutMinutes`; `enabled` is always true. `vbank_lastactive_v1` records activity and `vbank_applock_required_v1` preserves the lock across app restarts.

**Why:** The user requires a PIN whenever anyone returns to the app after leaving it, so this cannot be an optional per-device setting or silently bypassed when a user has not yet created a PIN.

**How to apply:** Keep lifecycle locking tied to authenticated sessions, persist the pending-lock marker before backgrounding, and require PIN setup for profiles without `pin_hash`. Do not add a no-PIN unlock fallback.

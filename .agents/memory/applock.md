---
name: App Lock
description: Idle-timeout app lock — hook, screen, settings card
---

App Lock is mandatory for authenticated users. Backgrounding the app does not lock it immediately; it locks after the selected inactivity period, including while the app is away. The saved lock marker survives a reload. Users can choose 1 minute through 8 hours. The App Lock passcode is separate from the transaction PIN and accepts 4–10 printable characters (letters, digits, and symbols; no spaces). It is stored as a server-side bcrypt hash in a private table and checked through authenticated RPCs. The migration copies existing transaction-PIN hashes as a compatibility credential so current users are not locked out.

Settings are stored in `vbank_applock_v1` with `timeoutMinutes`; `enabled` is always true. `vbank_lastactive_v1` records activity and `vbank_applock_required_v1` preserves the lock across app restarts.

If the App Lock migration is not yet installed, existing users can still unlock with the old transaction PIN, and users without one can set a temporary digits-only PIN. Apply the migration before expecting letter/symbol passcodes to work.

**Why:** The user wants the app to stay unlocked during brief interruptions, then require the separate passcode only after a user-selected period of inactivity. This credential must not weaken or change transaction PIN rules.

**How to apply:** Keep inactivity locking tied to authenticated sessions, preserve the pending-lock marker, keep App Lock and transaction PINs separate, and apply the schema migration before relying on mixed-character passcodes.

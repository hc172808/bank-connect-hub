---
name: App Lock
description: Idle-timeout app lock — hook, screen, settings card
---

App Lock is mandatory for authenticated users. Leaving or backgrounding the app locks it immediately; the saved lock marker survives a reload. An inactivity timeout also locks the app. The preferred App Lock passcode is separate from the transaction PIN and accepts 4–10 printable characters (letters, digits, and symbols; no spaces). It is stored as a server-side bcrypt hash in a private table and checked through authenticated RPCs. The migration copies existing transaction-PIN hashes as a compatibility credential so current users are not locked out.

Settings are stored in `vbank_applock_v1` with `timeoutMinutes`; `enabled` is always true. `vbank_lastactive_v1` records activity and `vbank_applock_required_v1` preserves the lock across app restarts.

If the App Lock migration is not yet installed, existing users can still unlock with the old transaction PIN, and users without one can set a temporary digits-only PIN. Apply the migration before expecting letter/symbol passcodes to work.

**Why:** The user requires a lock whenever anyone returns to the app and wants a 4–10 character passcode that can mix letters, digits, and symbols. This credential must not weaken or change the transaction PIN rules.

**How to apply:** Keep lifecycle locking tied to authenticated sessions, preserve the pending-lock marker, keep App Lock and transaction PINs separate, and apply the schema migration before relying on mixed-character passcodes.

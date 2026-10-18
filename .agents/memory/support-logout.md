---
name: Support-assisted logout
description: Product security decision for staff-assisted remote logout and PIN confirmation.
---

**Rule:** Admins, founders, and agents must be able to immediately sign a user out from the staff user-management page, even if the user has not set a wallet-lock PIN. Do not require the target user to enter a PIN for this staff action.

**Why:** The user changed the requirement after users without a wallet PIN could not be signed out; staff clicking the sign-out action must work regardless of PIN setup.

**How to apply:** Preserve server-side staff-role checks and revoke the target's active device sessions directly. Do not add a target PIN or OTP gate to staff-initiated sign-out.

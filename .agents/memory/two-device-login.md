---
name: Two-device login approval
description: Account sign-in policy for requesting approval on a second device.
---

A signed-in device must approve a login from a second device. Approval keeps both devices signed in, denial must not displace the existing session, and each account supports at most two active devices.

**Why:** The user explicitly requested two simultaneous device logins with approval from the already-signed-in device.

**How to apply:** Preserve this approval gate across password, WhatsApp-code, and biometric sign-in paths; never sign out the first device merely because a second device requests access.

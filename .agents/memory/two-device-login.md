---
name: Two-device login approval
description: Account sign-in policy for requesting approval on a second device.
---

A device-approval requirement is off by default and users can enable it in Security Settings. When enabled, a signed-in device approves a login from a second device. Approval keeps both devices signed in, denial must not displace the existing session, and each account supports at most two active devices.

**Why:** The user requested that approval not block sign-in by default, while remaining available as an opt-in security setting.

**How to apply:** Enforce approval only when the account setting is enabled, across password, WhatsApp-code, and biometric sign-in paths. Never sign out the first device merely because a second device requests access.

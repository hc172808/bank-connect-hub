---
name: Two-device login approval
description: Account sign-in policy for requesting approval on a second device.
---

A device-approval requirement is off by default and users can enable it in Security Settings. When enabled, an existing device approves sign-ins from new devices. Accounts may have unlimited active devices; users can sign out individual other devices or all other devices in Security Settings. Denial must not displace existing sessions.

**Why:** The user requested unlimited active devices, with user-controlled session removal in Security Settings; approval remains optional.

**How to apply:** Enforce approval only when the account setting is enabled across password, WhatsApp-code, and biometric sign-in paths. Do not impose a device-count cap. A device revoked by its owner should sign out locally without ending the user's other sessions.

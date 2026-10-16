---
name: Two-device login approval
description: Account sign-in policy for requesting approval on a second device.
---

A device-approval requirement is off by default and users can enable it in Security Settings. When enabled, an existing device approves sign-ins from new devices. Regular accounts are limited to two active devices; admins and founders have no device cap. Users can sign out individual other devices or all other devices in Security Settings. Denial must not displace existing sessions.

**Why:** The user requested a two-device limit for regular accounts and unlimited devices for admins/founders; approval and session removal remain user-controlled.

**How to apply:** Enforce the device cap using trusted `user_roles` records, never editable auth metadata. Enforce approval only when the account setting is enabled across password, WhatsApp-code, and biometric sign-in paths. A device revoked by its owner should sign out locally without ending the user's other sessions.

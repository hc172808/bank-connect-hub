---
name: WhatsApp verification workflow
description: WhatsApp verification uses an admin-configured click-to-chat number plus database-backed requests reviewed by administrators.
---

WhatsApp verification is intentionally human-reviewed: users send a pre-filled short code to the official support line, and admins match the code and phone number before approving the request. The support number and user instructions are editable app settings; the request table is protected by RLS.

**Why:** A click-to-WhatsApp flow does not prove delivery or identity by itself, and browser-only confirmation was not suitable for an admin-reviewed banking workflow.

**How to apply:** Keep the official number read-only for users, never request passwords or PINs in WhatsApp, and apply the WhatsApp verification migration before enabling request review in a Supabase project. Login WhatsApp OTP is a separate opt-in setting (`whatsapp_login_verification_enabled`) and must remain off when delivery is unavailable.

The login page's "Chat with an agent" action uses the in-app, human-only guest support queue. Keep that separate from WhatsApp verification and login OTP.

**Why:** Users asking for sign-in help should not be sent out of the app to start a support conversation.

**How to apply:** Preserve WhatsApp only for explicitly enabled verification or OTP flows; route login support to the in-app guest chat.
---
name: WhatsApp verification workflow
description: WhatsApp verification uses an admin-configured click-to-chat number plus database-backed requests reviewed by administrators.
---

WhatsApp verification is intentionally human-reviewed: users send a pre-filled short code to the official support line, and admins match the code and phone number before approving the request. The support number and user instructions are editable app settings; the request table is protected by RLS.

**Why:** A click-to-WhatsApp flow does not prove delivery or identity by itself, and browser-only confirmation was not suitable for an admin-reviewed banking workflow.

**How to apply:** Keep the official number read-only for users, never request passwords or PINs in WhatsApp, and apply the WhatsApp verification migration before enabling request review in a Supabase project.
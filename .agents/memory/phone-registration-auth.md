---
name: Phone registration confirmation
description: Authentication constraint for accounts represented by phone-derived internal email addresses
---

Phone-based accounts use an internal email-shaped identifier that users cannot confirm through a normal email inbox. Registration must therefore go through the server-side Supabase admin registration path, which confirms the internal email before the browser signs in.

**Why:** A client-only Supabase signUp can leave the account unconfirmed, making the next phone/password login look like invalid credentials even when the password is correct.

**How to apply:** Keep browser registration on the server registration endpoint, then establish the browser session with the normal client password sign-in. Do not replace this with direct client signUp unless a real user-facing email confirmation flow is added.
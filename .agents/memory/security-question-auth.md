---
name: Security question authentication
description: App-level login and recovery checks using private security answers.
---

Security-question checks are an app-level additional factor, not a guarantee that Supabase Auth itself rejects direct password sign-ins. Store only per-user salted scrypt hashes; keep challenges and answers on the server; do not give app login sessions to an untrusted device before the check. Preserve the existing trusted-device and approval flows. Apply the schema migration before enabling registration or new-device checks.

Accounts without a stored question must receive a setup challenge after their password (and any configured OTP) is verified, including on previously active devices. Show the setup as a modal and withhold the app session until the question and answer phrase are saved. After setup, continue through the normal device approval flow.

**Why:** The Supabase publishable key is intentionally public, so supported app routes can gate a session but cannot by themselves stop a client from calling Supabase's standard password endpoint directly. Avoid describing this as platform-enforced MFA.

**How to apply:** Keep recovery and new-device challenges server-verified, rate-limited, and service-role-only. Let existing users without a question set one during verified login; let signed-in users change it from Security Settings. Any stronger non-bypassable factor needs Supabase-level enforcement or a different session architecture.

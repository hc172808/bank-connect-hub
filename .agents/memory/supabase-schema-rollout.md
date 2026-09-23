---
name: Supabase schema rollout
description: The connected Supabase schema can lag the repository migrations and must be updated separately.
---

Repository migrations are not applied by the Vite build or app workflow. Treat database tables, RLS policies, and storage policies as a separate rollout step after code changes.

**Why:** The project can have valid client and server code while the connected Supabase API still returns missing-relation errors until migrations are applied.

**How to apply:** Include a versioned Supabase migration and the consolidated SQL when changing schema or policies, then explicitly apply it to the configured project before end-to-end verification. Inspect the live schema first: a project may contain real user rows but only a partial bootstrap, so prefer additive repair migrations over replaying a conflicting baseline.

The active project may also have RLS enabled on a table with no policies at all; verify `pg_policies` for role-management tables, not just table existence. Admin role/profile-management flows require explicit staff policies.

**Why:** A partial bootstrap can make reads appear to work while every role insert/update is silently rejected by RLS.

**How to apply:** For admin-management repairs, inspect both table RLS state and policy rows, then add narrowly scoped admin/founder policies before testing the UI.

The active Supabase project stores role values as text and does not define `public.app_role`; policies must call `public.has_role(auth.uid(), 'admin')` without an enum cast, and optional tables such as WhatsApp verification requests may be absent.

**Why:** A migration that casts to a missing enum or creates policies on an optional table stops before later security and KYC statements are applied.

**How to apply:** Check `pg_type`, `pg_policies`, and `to_regclass()` before applying staff migrations; make policy replacements idempotent and guard optional-table policy changes.
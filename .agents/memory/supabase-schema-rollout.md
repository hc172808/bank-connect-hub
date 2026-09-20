---
name: Supabase schema rollout
description: The connected Supabase schema can lag the repository migrations and must be updated separately.
---

Repository migrations are not applied by the Vite build or app workflow. Treat database tables, RLS policies, and storage policies as a separate rollout step after code changes.

**Why:** The project can have valid client and server code while the connected Supabase API still returns missing-relation errors until migrations are applied.

**How to apply:** Include a versioned Supabase migration and the consolidated SQL when changing schema or policies, then explicitly apply it to the configured project before end-to-end verification. Inspect the live schema first: a project may contain real user rows but only a partial bootstrap, so prefer additive repair migrations over replaying a conflicting baseline.
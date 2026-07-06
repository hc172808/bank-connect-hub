---
name: Replit migration
description: Notes from the Lovable → Replit migration of NETLIFE CASH
---

## What was done
- npm packages were partially corrupted on import; `lucide-react` and `date-fns` had dist files missing (only `.map` files). Fixed by `rm -rf node_modules/<pkg> && npm install <pkg>@<version>`.
- Supabase auth + database kept as-is (100+ pages, complex RLS — replacing would be a rewrite).
- Credentials moved to Replit Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `JWT_SECRET`.
- App starts with `npm run dev` (dev-start.mjs spawns Vite on :5000 + build-server on :3001).

**Why:** Supabase is too deeply integrated (auth triggers, RLS policies, Edge Functions, 100+ client calls) to replace during a migration without breaking the app.

**How to apply:** If packages appear broken after future installs, check for missing dist files and reinstall individually.

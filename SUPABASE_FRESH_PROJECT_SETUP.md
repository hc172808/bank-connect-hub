# Set up a new Supabase project

`SQL-update.sql` is the one-time schema installer for a **new, empty Supabase project**. It combines the ordered migrations with the fresh-project compatibility fixes and current app RPCs. It is not a data migration and must not be run against the current/live database or an existing project.

## 1. Install the schema

1. Create a new Supabase project.
2. Open that project's SQL Editor and run the complete `SQL-update.sql` file once.
3. Confirm the query completes successfully before configuring the app.

The script runs in a transaction. If it reports an error, do not rerun it blindly; the transaction should roll back. Keep the first SQL error and review it before trying again.

This file creates database objects and the `app-releases` storage bucket. It does not copy user accounts, passwords, transactions, uploaded files, project secrets, Supabase Auth settings, or Edge Functions.

## 2. Create the first admin

Register the first account through the app, find its UUID in **Supabase → Authentication → Users**, then run this once in SQL Editor, replacing the placeholder:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<AUTH_USER_UUID>'::uuid, 'admin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;
```

The internal-funds and bank-reserve feature toggles start disabled. After verifying the reserve and admin account, enable the applicable toggles from the admin Feature Toggles page.

## 3. Point the Replit app at the new project

Update the project values in Replit Secrets. Keep the service-role/secret key server-only; never put it in a `VITE_` variable or mobile build.

- `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for the server's runtime configuration.
- `SUPABASE_SERVICE_ROLE_KEY` (or the server-only `SUPABASE_SECRET_KEY` alias) for server-side admin operations.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_SUPABASE_PROJECT_ID` for build/mobile fallbacks.

Set the new project's Auth **Site URL** and allowed redirect URLs to the app's real web origin(s), including the `/reset-password` route. Add both preview and published origins if both are used.

## 4. Deploy Edge Functions

From the project, link the Supabase CLI to the new project and deploy the functions used by the app:

```sh
supabase login
supabase link --project-ref <NEW_PROJECT_REF>
supabase functions deploy admin-console
supabase functions deploy admin-delete-user
supabase functions deploy ai-fraud-analyst
supabase functions deploy process-reversals
```

The Supabase Edge Function runtime supplies the project URL and standard API keys. Set `LOVABLE_API_KEY` in the new project's Supabase Function Secrets if the AI fraud analyst feature will be used.

## 5. Verify before enabling money movement

- Register a test user and confirm profile, role, and wallet rows are created.
- Test password reset using the new Auth redirect allowlist.
- Confirm app releases can be uploaded by an admin and downloaded publicly.
- Confirm the admin dashboard and reserve snapshot load.
- Keep `internal_funds` disabled until the reserve is funded and the reserve/deposit flows have been checked with test accounts.
- Two-device approval is off by default; each user can opt in from Security Settings.

Running this SQL through the Dashboard does not record the migration history used by the Supabase CLI. Do not run `supabase db push` against this project later without first reconciling/baselining that history.

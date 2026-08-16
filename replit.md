# Virtual Bank (NETLIFE CASH)

A full-stack digital wallet and financial services web app built with React + Vite + TypeScript, backed by Supabase (auth, database, edge functions).

## Features
- Phone-based authentication with PIN, biometrics, and 2FA
- Role-based access: admin, agent, client, vendor
- Wallet management, money transfers, fund requests, reversals
- Blockchain wallet integration (Ethereum/BSC via ethers.js)
- Vendor storefront, QR payments, KYC submissions
- Admin dashboard: user management, fees, analytics, audit logs, announcements
- Push notifications, SMS alerts (Twilio), email alerts (SMTP)
- PWA support with offline caching

## Architecture
- **Frontend**: React 18 SPA (Vite, Tailwind CSS, shadcn/ui) on port **5000**
- **Backend**: Supabase (PostgreSQL with RLS, Auth, Edge Functions) — all auth and data
- **Build server**: Node.js Express (`build-server.mjs`) on port **3001** — handles APK builds, SMS, email, push notifications

## Running the app
The `Start application` workflow runs `npm run dev`, which starts:
1. Vite dev server on port **5000** (the main app)
2. Build server on port **3001** (API for APK builder, SMS, email, push)

`dev-start.mjs` orchestrates both processes (replaces `concurrently` which was blocked by Replit's security policy).

## Environment / Secrets
All secrets are stored in Replit Secrets or Env Vars:

**Required (already set):**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key (safe for frontend)
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID
- `VITE_WHATSAPP_SUPPORT_NUMBER` — WhatsApp support number

### PostgreSQL and pgAdmin

The project now supports three database connection modes through `.env`:

- `DATABASE_MODE=replit` — use Replit's provisioned PostgreSQL
- `DATABASE_MODE=local` — use the local Docker PostgreSQL + pgAdmin stack
- `DATABASE_MODE=remote` — use a remote PostgreSQL `DATABASE_URL`

For local setup, run:

```bash
npm run db:setup -- --mode=local
npm run db:check
```

This starts PostgreSQL on port `5432`, pgAdmin on port `5050`, loads
`all_migrations.sql` with the local Supabase compatibility bootstrap, and
generates the private connection details at
`.local/database-connection.local.md`.

Use `npm run db:down` to stop the local services. `npm run db:reset` removes
the local Docker volumes and is destructive; use it only when intentionally
recreating the local database.

**Optional (set in Replit Secrets to enable features):**
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — SMS alerts
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — Email alerts
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — Push notifications (auto-generated if not set)

## User preferences
- Keep Supabase as the auth and database layer (deeply integrated financial logic with RLS, security definer functions, and complex SQL procedures)
- The `concurrently` npm package is blocked by Replit's security policy — use `dev-start.mjs` instead
- Do not replace Supabase Auth with Replit Auth (would require rewriting all RLS policies and SQL functions)

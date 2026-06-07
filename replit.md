# Virtual Bank

A full-stack digital wallet and financial services web app built with React + Vite + TypeScript, backed by Supabase (auth, database, edge functions).

## Features
- Phone-based authentication with PIN, biometrics, and 2FA
- Role-based access: admin, agent, client, vendor
- Wallet management, money transfers, fund requests, reversals
- Blockchain wallet integration (Ethereum/BSC via ethers.js)
- Vendor storefront, QR payments, KYC submissions
- Admin dashboard: user management, fees, analytics, audit logs, announcements

## Architecture
- **Frontend**: React 18 SPA (Vite, Tailwind CSS, shadcn/ui)
- **Backend**: Supabase (PostgreSQL with RLS, Auth, Edge Functions)
- **Build server**: Node.js Express server (`build-server.mjs`) on port 3001 — handles APK build jobs
- **Mobile**: Capacitor wraps the SPA into a native Android APK

## Running the app
The `Start application` workflow runs `npm run dev`, which starts:
1. Vite dev server on port **5000**
2. Build server on port **3001** (APK builder API)

## Environment / Secrets
All secrets are stored in Replit Secrets:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `VITE_SUPABASE_PROJECT_ID` — Supabase project ID

## User preferences
- Keep Supabase as the auth and database layer (deeply integrated financial logic)

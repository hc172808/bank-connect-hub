# Mobile security and database architecture

## The mobile app must not connect to PostgreSQL

The APK/IPA is an untrusted client. Anything shipped in it can be inspected,
copied, or modified. The mobile app must never contain:

- `DATABASE_URL`
- PostgreSQL username or password
- pgAdmin credentials
- `SUPABASE_SERVICE_ROLE_KEY`
- Twilio, SMTP, JWT signing, or other server secrets

The mobile app uses the public HTTPS application URL. The app's existing
relative `/api/*` calls are routed through the production web server, and the
Supabase publishable key may be present in the client because it is protected
by Supabase RLS and authorization policies. A publishable key is not a
database password.

## Which database mode connects the existing app?

The existing app uses Supabase Auth, PostgREST queries, RPC functions,
Realtime subscriptions, Storage, and Supabase-specific database types. A raw
PostgreSQL `DATABASE_URL` alone is not an application data API and cannot
replace those services.

- `DB_MODE=local` starts plain PostgreSQL and pgAdmin for server-side tooling,
  migrations, and future backend services. It does **not** replace the
  application's current Supabase data plane.
- Supabase Cloud keeps the existing app connected to the current project.
- `DB_MODE=self-hosted` is the app-connected self-hosting path. It installs the
  Supabase API/Auth/Realtime/Storage stack backed by PostgreSQL, and the
  deployment writes the Supabase URL and publishable key used by the app.

Using plain PostgreSQL as the app's primary database would require a separate
backend API plus a deliberate migration of authentication, RLS, RPCs,
Realtime, Storage, and all existing client queries. Do not point the mobile
app at port 5432.

For a production APK, use:

```bash
CAP_PROD_URL=https://your-production-domain.example ./setup-mobile.sh release android
```

Release builds reject an `http://` `CAP_PROD_URL`. Development hot reload may
use HTTP on a private LAN only.

## Port separation

| Service | Port | Exposure |
| --- | ---: | --- |
| Production web app / API gateway | 443 HTTPS | Public |
| Production container app | 3000 | Behind reverse proxy |
| Build server API | 3001 | Internal only |
| Lite node RPC | 8545 | Localhost/internal only |
| PostgreSQL | 5432 | Localhost/private network only |
| pgAdmin | 5050 | Localhost/private admin access only |

PostgreSQL and pgAdmin bind to `127.0.0.1` by default. Access pgAdmin on a
remote server through an SSH tunnel:

```bash
ssh -L 5050:127.0.0.1:5050 user@your-server
```

Then open `http://127.0.0.1:5050`. Do not open ports 5432 or 5050 to the public
Internet.

## What prevents cloning and abuse

Perfect clone prevention is impossible: a determined attacker can decompile an
APK and reproduce its public UI and public requests. The goal is to make a
clone useless without an authorized account and a valid server session:

1. Enforce Supabase Auth and RLS on every table and RPC.
2. Perform role checks and transaction validation on the server/database, never
   only in React or Capacitor code.
3. Keep all service-role and database credentials server-side.
4. Use short-lived access tokens, refresh-token rotation, secure native token
   storage, logout/revocation, and server-side session limits.
5. Add rate limiting, replay protection, transaction limits, audit logs, and
   alerts to sensitive endpoints.
6. Add Android Play Integrity and iOS App Attest/DeviceCheck verification for
   high-risk actions. Attestation is an additional signal, not a replacement
   for authentication and authorization.
7. Require step-up authentication or biometric confirmation for transfers,
   password changes, new devices, and beneficiary changes.
8. Use HTTPS, secure headers, dependency updates, and signed release builds.

TLS, CORS, hidden routes, and obfuscation alone do not protect a database.
They are useful layers, but authorization and private network placement are
the controls that protect the data.
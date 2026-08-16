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
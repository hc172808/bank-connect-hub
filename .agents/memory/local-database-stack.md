---
name: Local database stack
description: Environment constraints and operating rules for the local PostgreSQL and pgAdmin Docker stack.
---

The local PostgreSQL/pgAdmin stack is run with Docker Compose. In this Replit
environment, Docker health checks that execute a process inside a running
container can fail with a `setns process` error even when PostgreSQL is healthy,
so readiness must be checked from the host using a PostgreSQL client connection.
The containers should bind their host ports to `127.0.0.1`; pgAdmin itself
listens on IPv4 inside the container because IPv6 is unavailable.

The production `deploy.sh` local mode is the single-server path: it generates
and reuses credentials, starts the private PostgreSQL/pgAdmin Compose project,
imports migrations, and writes the same connection values into the app
`.env`. The build server stays behind the web proxy rather than being opened
on its host port.

**Why:** The default Compose health check and pgAdmin bind behavior produced
false unhealthy states and restart loops during setup. Separating the
database stack from the public app while keeping deployment one-command avoids
exposing database/admin services and prevents password mismatches on reruns.

**How to apply:** Keep local setup commands host-side, use the compatibility
bootstrap before importing Supabase migrations into plain PostgreSQL, use
`DATABASE_MODE` to distinguish local, remote, and Replit-managed connections,
and access remote pgAdmin through an SSH tunnel or VPN.
---
name: Local database stack
description: Environment constraints and operating rules for the local PostgreSQL and pgAdmin Docker stack.
---

The local PostgreSQL/pgAdmin stack is run with Docker Compose. In this Replit
environment, Docker health checks that execute a process inside a running
container can fail with a `setns process` error even when PostgreSQL is healthy,
so readiness must be checked from the host using a PostgreSQL client connection.
pgAdmin must bind to IPv4 (`0.0.0.0`) because IPv6 is unavailable.

**Why:** The default Compose health check and pgAdmin bind behavior produced
false unhealthy states and restart loops during setup.

**How to apply:** Keep local setup commands host-side, use the compatibility
bootstrap before importing Supabase migrations into plain PostgreSQL, and use
`DATABASE_MODE` to distinguish local, remote, and Replit-managed connections.
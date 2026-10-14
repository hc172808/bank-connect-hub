---
name: Supabase database connectivity
description: Direct Supabase PostgreSQL connectivity from this Replit runtime.
---

The direct Supabase database hostname resolved only to IPv6, while the Replit shell could not open IPv6 sockets. Use an IPv4-compatible Supabase session-pooler connection string for direct PostgreSQL operations.

**Why:** The direct connection failed before authentication or schema inspection because the runtime reported an unsupported address family.

**How to apply:** Before running direct PostgreSQL inspection or migrations, verify the configured database host is reachable from the runtime; if it is IPv6-only, request the project's IPv4-compatible pooler URI.

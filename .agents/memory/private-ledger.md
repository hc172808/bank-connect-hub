---
name: Private ledger
description: Architecture and deployment requirement for the app's private financial rail
---

The application treats its database ledger as the only customer payment rail. The browser calls an authenticated transfer wrapper that derives the sender from the Supabase session; it must not call the legacy transaction function directly or rely on public RPC endpoints.

**Why:** The older transaction function accepted a client-supplied sender ID, and public RPC fallbacks made a supposedly private financial system fail open onto external networks.

**How to apply:** Keep customer transfers on the private ledger. Before production use, apply `private-ledger-migration.sql` to the Supabase database so direct legacy RPC execution is revoked and transaction inserts receive append-only SHA-256 chain entries. Keep all RPC endpoints explicitly private and fail closed when unavailable.
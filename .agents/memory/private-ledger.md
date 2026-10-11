---
name: Private ledger
description: Architecture and deployment requirement for the app's private financial rail
---

The application treats its database ledger as the only customer payment rail. The browser calls an authenticated transfer wrapper that derives the sender from the Supabase session; it must not call the legacy transaction function directly or rely on public RPC endpoints.

**Why:** The older transaction function accepted a client-supplied sender ID, and public RPC fallbacks made a supposedly private financial system fail open onto external networks.

**How to apply:** Keep customer transfers on the private ledger. Roll out the additive v2 transfer RPC first while leaving v1 available to already-installed clients. Deploy updated clients, test retries and duplicate requests with dedicated accounts, then reconcile balances and ledger transactions. Revoke v1 only in the separate deferred migration after that rollout is complete; verify remote migration history before applying anything. Keep all RPC endpoints explicitly private and fail closed when unavailable.

The hash-chain trigger pins `search_path` to `public`, so pgcrypto calls inside it must be schema-qualified as `extensions.digest(...)`.

**Why:** An unqualified `digest(...)` is not resolved from the restricted search path and makes transaction inserts fail.

**How to apply:** Schema-qualify extension functions in security-definer routines with restricted search paths, and ship an additive migration when updating an already-installed function.
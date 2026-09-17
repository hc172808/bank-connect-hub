---
name: Bank reserve controls
description: Durable security and rollout decisions for reserve funding and internal-funds controls.
---

The bank reserve is a database-backed singleton with an append-only movement ledger. Reserve changes, admin/founder funding, agent distributions, and pending-deposit approval must use atomic security-definer RPCs; client-side wallet updates are not an acceptable substitute.

**Why:** Internal funds must remain disabled by default and fail closed, while reserve and agent balances must not drift from partial client-side updates.

**How to apply:** Apply `bank-reserve-and-internal-funds.sql` to the Supabase project before using the reserve dashboard. Keep the `internal_funds` master switch disabled until an admin or founder explicitly enables it; the UI gates are convenience only and the RPC checks are authoritative.
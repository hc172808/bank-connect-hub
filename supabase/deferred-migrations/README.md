# Deferred Supabase migrations

Files in this directory are intentionally outside `supabase/migrations`, so a
normal migration push cannot apply them with the additive rollout.

## Legacy transfer RPC revocation

1. Apply the additive v2 transfer migration from `supabase/migrations` first.
   It leaves the v1 RPC available for already-installed clients.
2. Deploy updated web and mobile clients and confirm they call v2.
3. Test retries and duplicate requests with dedicated accounts, then reconcile
   wallet balances and ledger transactions.
4. Only after that rollout is complete, move the deferred revocation SQL into
   `supabase/migrations` and apply it in a planned window.

Do not move the revocation file early: Supabase migration commands normally
apply every pending file under `supabase/migrations`. No remote migration is
applied by these local files.

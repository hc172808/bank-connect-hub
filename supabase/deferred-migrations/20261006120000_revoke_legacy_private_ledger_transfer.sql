-- Phase 2 only: apply after all supported clients use the idempotent v2 RPC
-- and transfer/ledger reconciliation has passed.
DO $$
BEGIN
  IF to_regprocedure('public.process_private_ledger_transfer(uuid,numeric,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Legacy transfer RPC is missing; verify the target project and migration history before revoking.';
  END IF;

  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.process_private_ledger_transfer(uuid, numeric, text, text) FROM PUBLIC, anon, authenticated';
END
$$;

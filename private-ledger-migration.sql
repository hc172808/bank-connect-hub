-- NETLIFE CASH private ledger hardening
--
-- This migration preserves the existing wallets and transactions tables.
-- It adds a tamper-evident, append-only hash chain to every transaction
-- created by the existing atomic process_transaction function.
--
-- Apply this once in the Supabase SQL editor before enabling ledger auditing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.private_ledger_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  sequence_no     bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  previous_hash   text,
  entry_hash      text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.private_ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ledger entries are not client readable" ON public.private_ledger_entries;
CREATE POLICY "Ledger entries are not client readable"
  ON public.private_ledger_entries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Ledger entries cannot be inserted by clients" ON public.private_ledger_entries;
CREATE POLICY "Ledger entries cannot be inserted by clients"
  ON public.private_ledger_entries FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Ledger entries cannot be changed" ON public.private_ledger_entries;
CREATE POLICY "Ledger entries cannot be changed"
  ON public.private_ledger_entries FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "Ledger entries cannot be deleted" ON public.private_ledger_entries;
CREATE POLICY "Ledger entries cannot be deleted"
  ON public.private_ledger_entries FOR DELETE
  USING (false);

CREATE OR REPLACE FUNCTION public.append_private_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _previous_hash text;
  _payload text;
BEGIN
  -- Serialize writers so two simultaneous transfers cannot share a parent.
  PERFORM pg_advisory_xact_lock(7265941);

  SELECT entry_hash
    INTO _previous_hash
    FROM public.private_ledger_entries
   ORDER BY sequence_no DESC
   LIMIT 1;

  _payload := concat_ws(
    '|',
    NEW.id::text,
    NEW.sender_id::text,
    NEW.receiver_id::text,
    NEW.amount::text,
    NEW.fee::text,
    NEW.status,
    NEW.transaction_type,
    coalesce(NEW.description, ''),
    NEW.created_at::text,
    coalesce(_previous_hash, '')
  );

  INSERT INTO public.private_ledger_entries (
    transaction_id,
    previous_hash,
    entry_hash
  )
  VALUES (
    NEW.id,
    _previous_hash,
    encode(digest(_payload, 'sha256'), 'hex')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_private_ledger_entry ON public.transactions;
CREATE TRIGGER trg_private_ledger_entry
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.append_private_ledger_entry();

COMMENT ON TABLE public.private_ledger_entries IS
  'Append-only tamper-evident hash chain for the private financial ledger.';

-- Only this authenticated wrapper is callable by the browser. It derives the
-- sender from the Supabase session instead of trusting a client-supplied ID.
CREATE OR REPLACE FUNCTION public.process_private_ledger_transfer(
  _receiver_id uuid,
  _amount numeric,
  _transaction_type text,
  _description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  IF _receiver_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot transfer money to yourself.');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid amount.');
  END IF;

  RETURN public.process_transaction(
    auth.uid(),
    _receiver_id,
    _amount,
    _transaction_type,
    _description
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_transaction(uuid, uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_private_ledger_transfer(uuid, numeric, text, text)
  TO authenticated;
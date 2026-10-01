-- The ledger trigger runs with search_path=public. Qualify pgcrypto's
-- function explicitly so inserting a transaction does not depend on the
-- caller's search_path.
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
    encode(extensions.digest(_payload, 'sha256'), 'hex')
  );

  RETURN NEW;
END;
$$;
-- Persist successful private-ledger request IDs so retries cannot post a
-- second payment after a client timeout or lost response.
CREATE TABLE IF NOT EXISTS public.private_ledger_transfer_requests (
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  receiver_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  transaction_type text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sender_id, idempotency_key)
);

ALTER TABLE public.private_ledger_transfer_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.private_ledger_transfer_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_private_ledger_transfer_v2(
  _receiver_id uuid,
  _amount numeric,
  _transaction_type text,
  _idempotency_key uuid,
  _description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_id uuid := auth.uid();
  _is_staff boolean;
  _kyc_status text;
  _existing public.private_ledger_transfer_requests%ROWTYPE;
  _result jsonb;
  _inserted integer;
BEGIN
  IF _sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;
  IF _idempotency_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A secure transfer request ID is required.');
  END IF;
  IF _receiver_id IS NULL OR _receiver_id = _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose another user.');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid amount.');
  END IF;
  IF _transaction_type IS NULL OR length(trim(_transaction_type)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A transaction type is required.');
  END IF;

  SELECT (
    public.has_role(_sender_id, 'admin')
    OR public.has_role(_sender_id, 'founder')
  ) INTO _is_staff;

  IF NOT COALESCE(_is_staff, false) THEN
    SELECT COALESCE(kyc_status, 'unverified')
      INTO _kyc_status
      FROM public.profiles
     WHERE id = _sender_id;

    IF COALESCE(_kyc_status, 'unverified') NOT IN ('verified', 'approved') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Identity verification must be approved before you can send internal funds.'
      );
    END IF;
  END IF;

  INSERT INTO public.private_ledger_transfer_requests (
    sender_id, idempotency_key, receiver_id, amount, transaction_type
  )
  VALUES (_sender_id, _idempotency_key, _receiver_id, _amount, _transaction_type)
  ON CONFLICT (sender_id, idempotency_key) DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted = 0 THEN
    SELECT *
      INTO _existing
      FROM public.private_ledger_transfer_requests
     WHERE sender_id = _sender_id
       AND idempotency_key = _idempotency_key;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Transfer request could not be reserved. Retry safely.');
    END IF;

    IF _existing.receiver_id <> _receiver_id
       OR _existing.amount <> _amount
       OR _existing.transaction_type <> _transaction_type THEN
      RETURN jsonb_build_object('success', false, 'error', 'This request ID was already used for different transfer details.');
    END IF;

    IF _existing.response IS NOT NULL THEN
      RETURN _existing.response;
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'This transfer request is still processing. Retry with the same request ID.');
  END IF;

  -- process_transaction locks the sender wallet row and performs the debit,
  -- credit, and transaction insert atomically.
  _result := public.process_transaction(
    _sender_id, _receiver_id, _amount, _transaction_type, _description
  );

  IF COALESCE((_result ->> 'success')::boolean, false) THEN
    UPDATE public.private_ledger_transfer_requests
       SET response = _result
     WHERE sender_id = _sender_id
       AND idempotency_key = _idempotency_key;
  ELSE
    -- Failed requests are not cached, allowing a later retry after the cause
    -- (such as insufficient funds) has been resolved.
    DELETE FROM public.private_ledger_transfer_requests
     WHERE sender_id = _sender_id
       AND idempotency_key = _idempotency_key;
  END IF;

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_private_ledger_transfer_v2(uuid, numeric, text, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_private_ledger_transfer_v2(uuid, numeric, text, uuid, text)
  TO authenticated;

-- The old RPC has no request ID and cannot safely deduplicate a replay. Force
-- old clients to fail closed rather than retain an unprotected transfer path.
REVOKE EXECUTE ON FUNCTION public.process_private_ledger_transfer(uuid, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
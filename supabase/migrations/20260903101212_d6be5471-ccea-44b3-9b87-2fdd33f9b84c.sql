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

REVOKE EXECUTE ON FUNCTION public.process_transaction(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_private_ledger_transfer(uuid, numeric, text, text) TO authenticated;
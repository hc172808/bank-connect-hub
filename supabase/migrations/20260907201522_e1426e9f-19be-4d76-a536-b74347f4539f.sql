ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS chain_tx_hash text,
  ADD COLUMN IF NOT EXISTS chain_block_number bigint,
  ADD COLUMN IF NOT EXISTS chain_status text NOT NULL DEFAULT 'off_chain';

CREATE INDEX IF NOT EXISTS idx_transactions_chain_block ON public.transactions (chain_block_number);

CREATE OR REPLACE FUNCTION public.record_chain_receipt(
  _transaction_id uuid,
  _block_number bigint,
  _tx_hash text DEFAULT NULL,
  _status text DEFAULT 'anchored'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tx record;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.');
  END IF;

  IF _status NOT IN ('off_chain', 'anchored', 'confirmed', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid chain status.');
  END IF;

  SELECT * INTO _tx FROM public.transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found.');
  END IF;

  IF _tx.sender_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not allowed.');
  END IF;

  UPDATE public.transactions
  SET chain_block_number = _block_number,
      chain_tx_hash = COALESCE(_tx_hash, chain_tx_hash),
      chain_status = _status
  WHERE id = _transaction_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_chain_receipt(uuid, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_chain_receipt(uuid, bigint, text, text) TO authenticated;
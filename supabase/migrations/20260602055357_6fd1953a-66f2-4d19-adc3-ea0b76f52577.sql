
-- 1. Add disabled flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid;

-- 2. Allow admins to update any profile (for disable / re-enable)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Allow admins to delete profiles (cascade-style cleanup support)
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Update process_transaction to reject disabled accounts
CREATE OR REPLACE FUNCTION public.process_transaction(
  _sender_id uuid,
  _receiver_id uuid,
  _amount numeric,
  _transaction_type text,
  _description text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _sender_balance numeric;
  _fee_percentage numeric;
  _fixed_fee numeric;
  _total_fee numeric;
  _total_amount numeric;
  _transaction_id uuid;
  _sender_cashback numeric;
  _liquidity_pool_fee numeric;
  _is_admin boolean;
  _sender_disabled boolean;
  _receiver_disabled boolean;
BEGIN
  SELECT disabled INTO _sender_disabled FROM public.profiles WHERE id = _sender_id;
  SELECT disabled INTO _receiver_disabled FROM public.profiles WHERE id = _receiver_id;
  IF COALESCE(_sender_disabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your account is disabled. Please contact support.');
  END IF;
  IF COALESCE(_receiver_disabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient account is disabled.');
  END IF;

  SELECT public.has_role(_sender_id, 'admin') INTO _is_admin;

  SELECT balance INTO _sender_balance
  FROM public.wallets
  WHERE user_id = _sender_id
  FOR UPDATE;

  SELECT fee_percentage, fixed_fee INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees
  WHERE transaction_type = _transaction_type;

  IF _is_admin THEN
    _total_fee := 0;
    _sender_cashback := 0;
    _liquidity_pool_fee := 0;
    _total_amount := _amount;
  ELSE
    _total_fee := (_amount * COALESCE(_fee_percentage, 0) / 100) + COALESCE(_fixed_fee, 0);
    _sender_cashback := _total_fee * 0.60;
    _liquidity_pool_fee := _total_fee * 0.40;
    _total_amount := _amount + _liquidity_pool_fee;
  END IF;

  IF NOT _is_admin AND _sender_balance < _total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  IF NOT _is_admin THEN
    UPDATE public.wallets
    SET balance = balance - _total_amount, updated_at = now()
    WHERE user_id = _sender_id;
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_receiver_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = wallets.balance + _amount, updated_at = now();

  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (_sender_id, _receiver_id, _amount, _total_fee, 'completed', _transaction_type, _description, now())
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'fee', _total_fee,
    'sender_cashback', _sender_cashback,
    'liquidity_pool_fee', _liquidity_pool_fee
  );
END;
$function$;

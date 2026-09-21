-- Make staff role changes and internal funding work consistently for admins
-- and founders. Browser role writes remain blocked; the app uses its protected
-- server endpoint for role changes.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'founder';

CREATE OR REPLACE FUNCTION public.admin_add_funds(
  _user_id uuid,
  _amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _transaction_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid user and positive amount.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found.');
  END IF;

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_user_id, _amount, 'USD')
  ON CONFLICT (user_id) DO UPDATE
  SET balance = wallets.balance + EXCLUDED.balance,
      updated_at = now();

  IF auth.uid() = _user_id THEN
    RETURN jsonb_build_object('success', true, 'transaction_id', NULL, 'message', 'Funds added.');
  END IF;

  INSERT INTO public.transactions (
    sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at
  )
  VALUES (
    auth.uid(), _user_id, _amount, 0, 'completed', 'deposit',
    'Admin deposit', now()
  )
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', _transaction_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_add_funds(uuid, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(uuid, numeric) TO authenticated;

-- Admins and founders have unlimited internal-send funding and do not need
-- end-user KYC approval to send or receive internal funds.
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
  _is_staff boolean;
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

  SELECT (
    public.has_role(_sender_id, 'admin'::public.app_role)
    OR public.has_role(_sender_id, 'founder'::public.app_role)
  ) INTO _is_staff;

  SELECT balance INTO _sender_balance
  FROM public.wallets
  WHERE user_id = _sender_id
  FOR UPDATE;

  SELECT fee_percentage, fixed_fee INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees
  WHERE transaction_type = _transaction_type;

  IF _is_staff THEN
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

  IF NOT _is_staff AND COALESCE(_sender_balance, 0) < _total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  IF NOT _is_staff THEN
    UPDATE public.wallets
    SET balance = balance - _total_amount, updated_at = now()
    WHERE user_id = _sender_id;
  END IF;

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_receiver_id, _amount, 'USD')
  ON CONFLICT (user_id) DO UPDATE
  SET balance = wallets.balance + EXCLUDED.balance, updated_at = now();

  INSERT INTO public.transactions (
    sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at
  )
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
DECLARE
  _is_staff boolean;
  _kyc_status text;
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

  SELECT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  ) INTO _is_staff;

  IF NOT _is_staff THEN
    SELECT COALESCE(kyc_status, 'unverified')
    INTO _kyc_status
    FROM public.profiles
    WHERE id = auth.uid();

    IF COALESCE(_kyc_status, 'unverified') NOT IN ('verified', 'approved') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Identity verification must be approved before you can send internal funds.'
      );
    END IF;
  END IF;

  RETURN public.process_transaction(
    auth.uid(), _receiver_id, _amount, _transaction_type, _description
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_transaction(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_private_ledger_transfer(uuid, numeric, text, text) TO authenticated;
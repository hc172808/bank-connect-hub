-- Make admin/founder credits atomic with a durable audit row and balance
-- snapshots. A missing wallet is created rather than silently skipped.

CREATE TABLE IF NOT EXISTS public.admin_fund_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  transaction_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_fund_audit_log_created_at_idx
  ON public.admin_fund_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_fund_audit_log_target_created_at_idx
  ON public.admin_fund_audit_log (target_user_id, created_at DESC);

ALTER TABLE public.admin_fund_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and founders can view fund audit log"
  ON public.admin_fund_audit_log;
CREATE POLICY "Admins and founders can view fund audit log"
  ON public.admin_fund_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'founder')
  );

REVOKE ALL ON TABLE public.admin_fund_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_fund_audit_log TO authenticated;

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
  _audit_id uuid;
  _balance_before numeric;
  _balance_after numeric;
  _currency text;
  _created_at timestamptz;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'founder')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid user and positive amount.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found.');
  END IF;

  -- Create a zero-balance row first so concurrent credits serialize on the
  -- same wallet row and each audit snapshot has the correct prior balance.
  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_user_id, 0, 'USD')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance
    INTO _balance_before
    FROM public.wallets
   WHERE user_id = _user_id
   FOR UPDATE;

  UPDATE public.wallets
     SET balance = balance + _amount,
         updated_at = now()
   WHERE user_id = _user_id
  RETURNING balance, currency
    INTO _balance_after, _currency;

  -- Keep the existing transaction feed in sync for non-self credits. The
  -- dedicated audit row below also covers a staff member funding themselves.
  IF auth.uid() <> _user_id THEN
    INSERT INTO public.transactions (
      sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at
    )
    VALUES (
      auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin deposit', now()
    )
    RETURNING id INTO _transaction_id;
  END IF;

  INSERT INTO public.admin_fund_audit_log (
    actor_id, target_user_id, transaction_id, amount, currency,
    balance_before, balance_after
  )
  VALUES (
    auth.uid(), _user_id, _transaction_id, _amount, COALESCE(_currency, 'USD'),
    _balance_before, _balance_after
  )
  RETURNING id, created_at INTO _audit_id, _created_at;

  RETURN jsonb_build_object(
    'success', true,
    'audit_id', _audit_id,
    'transaction_id', _transaction_id,
    'balance_before', _balance_before,
    'balance_after', _balance_after,
    'currency', COALESCE(_currency, 'USD'),
    'created_at', _created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_funds(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(uuid, numeric) TO authenticated;

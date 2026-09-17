-- Bank reserve, controlled agent distributions, internal-funds master switch,
-- and founder/admin verification bypass support.
--
-- Apply this migration to the Supabase database before using the reserve pages.

CREATE TABLE IF NOT EXISTS public.bank_reserve (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  low_balance_threshold numeric NOT NULL DEFAULT 5000 CHECK (low_balance_threshold >= 0),
  currency text NOT NULL DEFAULT 'GYD',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.bank_reserve (id, balance, low_balance_threshold, currency)
VALUES (1, 0, 5000, 'GYD')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bank_reserve_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserve_id integer NOT NULL DEFAULT 1 REFERENCES public.bank_reserve(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  balance_before numeric NOT NULL,
  balance_after numeric NOT NULL,
  related_user_id uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_reserve ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reserve_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view bank reserve" ON public.bank_reserve;
CREATE POLICY "Admins view bank reserve" ON public.bank_reserve
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text IN ('admin', 'founder')
    )
  );

DROP POLICY IF EXISTS "Admins view reserve ledger" ON public.bank_reserve_ledger;
CREATE POLICY "Admins view reserve ledger" ON public.bank_reserve_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text IN ('admin', 'founder')
    )
  );

CREATE OR REPLACE FUNCTION public.internal_funds_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT is_enabled
    FROM public.feature_toggles
    WHERE feature_key = 'internal_funds'
    ORDER BY updated_at DESC
    LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.is_reserve_manager(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('admin', 'founder')
  );
$$;

CREATE OR REPLACE FUNCTION public.notify_reserve_low()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserve_row public.bank_reserve%ROWTYPE;
BEGIN
  SELECT * INTO reserve_row FROM public.bank_reserve WHERE id = 1;
  IF reserve_row.balance <= reserve_row.low_balance_threshold
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications
       WHERE type = 'reserve_low'
         AND created_at > now() - interval '6 hours'
     ) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    SELECT ur.user_id,
           'Bank reserve is low',
           format('The bank reserve is %s %s, below the alert threshold of %s %s.',
             reserve_row.currency, to_char(reserve_row.balance, 'FM9999999990.00'),
             reserve_row.currency, to_char(reserve_row.low_balance_threshold, 'FM9999999990.00')),
           'reserve_low'
    FROM public.user_roles ur
    WHERE ur.role::text IN ('admin', 'founder');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bank_reserve_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserve_row public.bank_reserve%ROWTYPE;
BEGIN
  IF NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO reserve_row FROM public.bank_reserve WHERE id = 1;
  RETURN jsonb_build_object(
    'success', true,
    'balance', reserve_row.balance,
    'low_balance_threshold', reserve_row.low_balance_threshold,
    'currency', reserve_row.currency,
    'is_low', reserve_row.balance <= reserve_row.low_balance_threshold,
    'updated_at', reserve_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'total_users', (SELECT count(*) FROM public.profiles),
    'active_agents', (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role::text = 'agent')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bank_reserve(
  _balance numeric,
  _low_balance_threshold numeric DEFAULT 5000,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_balance numeric;
BEGIN
  IF NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _balance IS NULL OR _balance < 0 OR _low_balance_threshold IS NULL OR _low_balance_threshold < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance and threshold must be zero or greater');
  END IF;

  SELECT balance INTO old_balance FROM public.bank_reserve WHERE id = 1 FOR UPDATE;
  UPDATE public.bank_reserve
  SET balance = _balance,
      low_balance_threshold = _low_balance_threshold,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = 1;

  INSERT INTO public.bank_reserve_ledger
    (actor_id, entry_type, amount, balance_before, balance_after, notes)
  VALUES
    (auth.uid(), 'reserve_adjustment', _balance - old_balance, old_balance, _balance, _notes);

  PERFORM public.notify_reserve_low();
  RETURN jsonb_build_object('success', true, 'balance', _balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_bank_reserve_to_agent(
  _agent_id uuid,
  _amount numeric,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_balance numeric;
  new_balance numeric;
BEGIN
  IF NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _agent_id AND role::text = 'agent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient is not an agent');
  END IF;

  SELECT balance INTO old_balance FROM public.bank_reserve WHERE id = 1 FOR UPDATE;
  IF old_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bank reserve');
  END IF;

  UPDATE public.bank_reserve
  SET balance = balance - _amount, updated_by = auth.uid(), updated_at = now()
  WHERE id = 1
  RETURNING balance INTO new_balance;

  UPDATE public.wallets
  SET balance = balance + _amount, updated_at = now()
  WHERE user_id = _agent_id;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, currency) VALUES (_agent_id, _amount, 'GYD');
  END IF;

  INSERT INTO public.bank_reserve_ledger
    (actor_id, entry_type, amount, balance_before, balance_after, related_user_id, notes)
  VALUES
    (auth.uid(), 'reserve_to_agent', -_amount, old_balance, new_balance, _agent_id, _notes);

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (auth.uid(), _agent_id, _amount, 0, 'completed', 'reserve_agent_funding',
     COALESCE(_notes, 'Bank reserve allocation to agent'), now());

  PERFORM public.notify_reserve_low();
  RETURN jsonb_build_object('success', true, 'balance', new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_distribute_funds(
  _receiver_id uuid,
  _amount numeric,
  _description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_balance numeric;
  transaction_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'agent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only agents can distribute funds');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _receiver_id AND role::text IN ('client', 'vendor')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient must be a client or vendor');
  END IF;

  SELECT balance INTO sender_balance FROM public.wallets WHERE user_id = auth.uid() FOR UPDATE;
  IF COALESCE(sender_balance, 0) < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient agent balance');
  END IF;

  UPDATE public.wallets SET balance = balance - _amount, updated_at = now() WHERE user_id = auth.uid();
  UPDATE public.wallets SET balance = balance + _amount, updated_at = now() WHERE user_id = _receiver_id;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, currency) VALUES (_receiver_id, _amount, 'GYD');
  END IF;

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (auth.uid(), _receiver_id, _amount, 0, 'completed', 'agent_distribution',
     COALESCE(_description, 'Agent distribution'), now())
  RETURNING id INTO transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', transaction_id);
END;
$$;

-- Replace the legacy direct-credit RPC with a reserve-backed operation.
CREATE OR REPLACE FUNCTION public.admin_add_funds(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_balance numeric;
  new_balance numeric;
BEGIN
  IF NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero');
  END IF;

  SELECT balance INTO old_balance FROM public.bank_reserve WHERE id = 1 FOR UPDATE;
  IF old_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bank reserve');
  END IF;
  UPDATE public.bank_reserve
  SET balance = balance - _amount, updated_by = auth.uid(), updated_at = now()
  WHERE id = 1
  RETURNING balance INTO new_balance;

  UPDATE public.wallets SET balance = balance + _amount, updated_at = now() WHERE user_id = _user_id;
  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, currency) VALUES (_user_id, _amount, 'GYD');
  END IF;

  INSERT INTO public.bank_reserve_ledger
    (actor_id, entry_type, amount, balance_before, balance_after, related_user_id, notes)
  VALUES
    (auth.uid(), 'reserve_to_user', -_amount, old_balance, new_balance, _user_id, 'Admin deposit');
  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin reserve-backed deposit', now());

  PERFORM public.notify_reserve_low();
  RETURN jsonb_build_object('success', true, 'balance', new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_pending_deposit(_deposit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deposit_row public.pending_deposits%ROWTYPE;
  funding_result jsonb;
BEGIN
  IF NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled');
  END IF;

  SELECT * INTO deposit_row
  FROM public.pending_deposits
  WHERE id = _deposit_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed');
  END IF;

  funding_result := public.admin_add_funds(deposit_row.user_id, deposit_row.amount);
  IF COALESCE((funding_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN funding_result;
  END IF;

  UPDATE public.pending_deposits
  SET status = 'approved', approved_by = auth.uid(), processed_at = now()
  WHERE id = _deposit_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Internal funds fail closed until an admin/founder explicitly enables them.
INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled)
SELECT 'internal_funds', 'Internal Funds (master switch)', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_toggles WHERE feature_key = 'internal_funds'
);

INSERT INTO public.app_settings (key, value)
VALUES
  ('notification_provider', 'in_app'),
  ('notification_sender', 'NetLife Cash')
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "Admins can manage feature toggles" ON public.feature_toggles;
DROP POLICY IF EXISTS "Admins and founders can manage feature toggles" ON public.feature_toggles;
CREATE POLICY "Admins and founders can manage feature toggles" ON public.feature_toggles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text IN ('admin', 'founder')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text IN ('admin', 'founder')
    )
  );

GRANT EXECUTE ON FUNCTION public.internal_funds_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_reserve_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_reserve_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bank_reserve(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_bank_reserve_to_agent(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_distribute_funds(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_deposit(uuid) TO authenticated;
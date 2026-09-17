-- Bank reserve and staff distribution controls.
-- Apply this migration to the Supabase project before using the dashboard.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'founder';

CREATE TABLE IF NOT EXISTS public.bank_reserve (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  balance numeric(18, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  low_balance_threshold numeric(18, 2) NOT NULL DEFAULT 5000 CHECK (low_balance_threshold >= 0),
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.bank_reserve (id, balance, low_balance_threshold)
VALUES (true, 0, 5000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bank_reserve_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN ('funding', 'adjustment', 'agent_grant')),
  amount numeric(18, 2) NOT NULL CHECK (amount <> 0),
  balance_after numeric(18, 2) NOT NULL CHECK (balance_after >= 0),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  agent_id uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_reserve_ledger_created_at
  ON public.bank_reserve_ledger (created_at DESC);

ALTER TABLE public.bank_reserve ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reserve_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view bank reserve" ON public.bank_reserve;
CREATE POLICY "Staff can view bank reserve"
  ON public.bank_reserve FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can view bank reserve ledger" ON public.bank_reserve_ledger;
CREATE POLICY "Staff can view bank reserve ledger"
  ON public.bank_reserve_ledger FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  );

DROP POLICY IF EXISTS "Founders can view all notifications" ON public.notifications;
CREATE POLICY "Founders can view all notifications"
  ON public.notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'founder'::public.app_role));

DROP POLICY IF EXISTS "Founders can view all profiles" ON public.profiles;
CREATE POLICY "Founders can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'founder'::public.app_role));

DROP POLICY IF EXISTS "Founders can view all roles" ON public.user_roles;
CREATE POLICY "Founders can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'founder'::public.app_role));

DROP POLICY IF EXISTS "Founders can view all wallets" ON public.wallets;
CREATE POLICY "Founders can view all wallets"
  ON public.wallets FOR SELECT
  USING (public.has_role(auth.uid(), 'founder'::public.app_role));

CREATE OR REPLACE FUNCTION public.bank_reserve_notify_low(
  _balance numeric,
  _threshold numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _staff record;
BEGIN
  IF _balance > _threshold THEN
    RETURN;
  END IF;

  FOR _staff IN
    SELECT DISTINCT user_id
    FROM public.user_roles
    WHERE role IN ('admin'::public.app_role, 'founder'::public.app_role)
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      _staff.user_id,
      'Bank reserve is low',
      format('The bank reserve is %s %s, below the configured alert level of %s %s.',
        to_char(_balance, 'FM999999999990.00'), 'USD',
        to_char(_threshold, 'FM999999999990.00'), 'USD'),
      'bank_reserve_low'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bank_reserve_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _reserve public.bank_reserve%ROWTYPE;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _reserve FROM public.bank_reserve WHERE id = true;
  RETURN jsonb_build_object(
    'success', true,
    'balance', _reserve.balance,
    'low_balance_threshold', _reserve.low_balance_threshold,
    'currency', _reserve.currency,
    'is_low', _reserve.balance <= _reserve.low_balance_threshold,
    'updated_at', _reserve.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_bank_reserve(
  _balance numeric,
  _low_balance_threshold numeric DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_balance numeric;
  _new_threshold numeric;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins and founders can change the bank reserve.');
  END IF;
  IF _balance IS NULL OR _balance < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reserve balance cannot be negative.');
  END IF;
  IF _low_balance_threshold IS NOT NULL AND _low_balance_threshold < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Alert threshold cannot be negative.');
  END IF;

  SELECT balance, low_balance_threshold INTO _old_balance, _new_threshold
  FROM public.bank_reserve WHERE id = true FOR UPDATE;
  _new_threshold := COALESCE(_low_balance_threshold, _new_threshold);

  UPDATE public.bank_reserve
  SET balance = round(_balance, 2),
      low_balance_threshold = round(_new_threshold, 2),
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = true;

  IF _balance <> _old_balance THEN
    INSERT INTO public.bank_reserve_ledger
      (entry_type, amount, balance_after, actor_id, notes)
    VALUES
      ('adjustment', round(_balance - _old_balance, 2), round(_balance, 2), auth.uid(), _notes);
  END IF;

  PERFORM public.bank_reserve_notify_low(_balance, _new_threshold);
  RETURN jsonb_build_object('success', true, 'balance', round(_balance, 2), 'low_balance_threshold', round(_new_threshold, 2));
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
  _reserve_balance numeric;
  _threshold numeric;
  _new_balance numeric;
  _agent_name text;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'founder'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admins and founders can fund agents.');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be greater than zero.');
  END IF;
  IF NOT public.has_role(_agent_id, 'agent'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'The selected user is not an agent.');
  END IF;

  SELECT balance, low_balance_threshold INTO _reserve_balance, _threshold
  FROM public.bank_reserve WHERE id = true FOR UPDATE;
  IF _reserve_balance < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'The bank reserve does not have enough available funds.');
  END IF;

  UPDATE public.bank_reserve
  SET balance = balance - round(_amount, 2), updated_at = now(), updated_by = auth.uid()
  WHERE id = true
  RETURNING balance INTO _new_balance;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_agent_id, round(_amount, 2))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance, updated_at = now();

  SELECT full_name INTO _agent_name FROM public.profiles WHERE id = _agent_id;
  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (auth.uid(), _agent_id, round(_amount, 2), 0, 'completed', 'deposit',
     COALESCE(_notes, 'Bank reserve allocation to agent'), now());

  INSERT INTO public.bank_reserve_ledger
    (entry_type, amount, balance_after, actor_id, agent_id, notes)
  VALUES
    ('agent_grant', -round(_amount, 2), _new_balance, auth.uid(), _agent_id,
     COALESCE(_notes, 'Allocation to ' || COALESCE(_agent_name, 'agent')));

  PERFORM public.bank_reserve_notify_low(_new_balance, _threshold);
  RETURN jsonb_build_object('success', true, 'balance', _new_balance);
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
  _sender_balance numeric;
  _receiver_role public.app_role;
  _transaction_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'agent'::public.app_role) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only agents can distribute allocated funds.');
  END IF;
  IF _receiver_id = auth.uid() OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose another user and enter a valid amount.');
  END IF;

  SELECT role INTO _receiver_role
  FROM public.user_roles
  WHERE user_id = _receiver_id
    AND role IN ('client'::public.app_role, 'vendor'::public.app_role)
  LIMIT 1;
  IF _receiver_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agents can distribute only to clients or vendors.');
  END IF;

  SELECT balance INTO _sender_balance
  FROM public.wallets
  WHERE user_id = auth.uid()
  FOR UPDATE;
  IF COALESCE(_sender_balance, 0) < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your allocated agent balance is too low.');
  END IF;

  UPDATE public.wallets
  SET balance = balance - round(_amount, 2), updated_at = now()
  WHERE user_id = auth.uid();
  INSERT INTO public.wallets (user_id, balance)
  VALUES (_receiver_id, round(_amount, 2))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance, updated_at = now();

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (auth.uid(), _receiver_id, round(_amount, 2), 0, 'completed', 'transfer',
     COALESCE(_description, 'Agent distribution'), now())
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', _transaction_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bank_reserve_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bank_reserve(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_bank_reserve_to_agent(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_distribute_funds(uuid, numeric, text) TO authenticated;
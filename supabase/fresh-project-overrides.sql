-- Fresh-project-only compatibility and app RPCs.
-- The generator keeps this after the ordered migration chain so the final
-- definitions below take precedence over older snapshots in that chain.

INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled)
VALUES ('internal_funds', 'Internal Funds (master switch)', false)
ON CONFLICT (feature_key) DO NOTHING;

GRANT SELECT ON TABLE public.bank_reserve, public.bank_reserve_ledger TO authenticated;
GRANT ALL ON TABLE public.bank_reserve, public.bank_reserve_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.internal_funds_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT ft.is_enabled
    FROM public.feature_toggles AS ft
    WHERE ft.feature_key = 'internal_funds'
    ORDER BY ft.updated_at DESC
    LIMIT 1
  ), false);
$$;

REVOKE ALL ON FUNCTION public.internal_funds_enabled() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_funds_enabled() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_reserve_manager(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN ('admin', 'founder')
  );
$$;

REVOKE ALL ON FUNCTION public.is_reserve_manager(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_reserve_low()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserve_row public.bank_reserve%ROWTYPE;
  staff_row record;
BEGIN
  SELECT *
    INTO reserve_row
    FROM public.bank_reserve
   WHERE id = 1;

  IF NOT FOUND OR reserve_row.balance > reserve_row.low_balance_threshold THEN
    RETURN;
  END IF;

  FOR staff_row IN
    SELECT DISTINCT user_id
      FROM public.user_roles
     WHERE role::text IN ('admin', 'founder')
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.notifications
       WHERE user_id = staff_row.user_id
         AND type = 'reserve_low'
         AND created_at > now() - interval '6 hours'
    ) THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        staff_row.user_id,
        'Bank reserve is low',
        format(
          'The bank reserve is %s %s, below the alert threshold of %s %s.',
          reserve_row.currency,
          to_char(reserve_row.balance, 'FM9999999990.00'),
          reserve_row.currency,
          to_char(reserve_row.low_balance_threshold, 'FM9999999990.00')
        ),
        'reserve_low'
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_reserve_low() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bank_reserve_notify_low(numeric, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_users', (SELECT count(*) FROM public.profiles),
    'active_agents', (
      SELECT count(DISTINCT user_id)
        FROM public.user_roles
       WHERE role::text = 'agent'
    )
  );
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
  IF auth.uid() IS NULL OR NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT *
    INTO reserve_row
    FROM public.bank_reserve
   WHERE id = 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank reserve is not configured.');
  END IF;

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
  old_balance numeric(18, 2);
  old_threshold numeric(18, 2);
  new_balance numeric(18, 2);
  new_threshold numeric(18, 2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _balance IS NULL OR _balance < 0
     OR (_low_balance_threshold IS NOT NULL AND _low_balance_threshold < 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance and threshold must be zero or greater.');
  END IF;

  SELECT balance, low_balance_threshold
    INTO old_balance, old_threshold
    FROM public.bank_reserve
   WHERE id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank reserve is not configured.');
  END IF;

  new_balance := round(_balance, 2);
  new_threshold := round(COALESCE(_low_balance_threshold, old_threshold), 2);

  UPDATE public.bank_reserve
     SET balance = new_balance,
         low_balance_threshold = new_threshold,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE id = 1;

  IF new_balance <> old_balance THEN
    INSERT INTO public.bank_reserve_ledger (
      reserve_id, entry_type, amount, balance_before, balance_after, actor_id, notes
    )
    VALUES (
      1, 'reserve_adjustment', new_balance - old_balance,
      old_balance, new_balance, auth.uid(), _notes
    );
  END IF;

  PERFORM public.notify_reserve_low();
  RETURN jsonb_build_object(
    'success', true,
    'balance', new_balance,
    'low_balance_threshold', new_threshold
  );
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
  reserve_before numeric(18, 2);
  reserve_after numeric(18, 2);
  threshold numeric(18, 2);
  reserve_currency text;
  amount_to_grant numeric(18, 2);
  agent_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled.');
  END IF;
  IF _agent_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid agent and positive amount.');
  END IF;

  amount_to_grant := round(_amount, 2);
  IF amount_to_grant <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be at least one cent.');
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = _agent_id
       AND role::text = 'agent'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient is not an agent.');
  END IF;

  SELECT balance, low_balance_threshold, currency
    INTO reserve_before, threshold, reserve_currency
    FROM public.bank_reserve
   WHERE id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank reserve is not configured.');
  END IF;
  IF reserve_before < amount_to_grant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bank reserve.');
  END IF;

  UPDATE public.bank_reserve
     SET balance = balance - amount_to_grant,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = 1
   RETURNING balance INTO reserve_after;

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_agent_id, amount_to_grant, reserve_currency)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();

  SELECT full_name
    INTO agent_name
    FROM public.profiles
   WHERE id = _agent_id;

  INSERT INTO public.transactions (
    sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at
  )
  VALUES (
    auth.uid(), _agent_id, amount_to_grant, 0, 'completed', 'deposit',
    COALESCE(_notes, 'Bank reserve allocation to agent'), now()
  );

  INSERT INTO public.bank_reserve_ledger (
    reserve_id, entry_type, amount, balance_before, balance_after,
    actor_id, agent_id, related_user_id, notes
  )
  VALUES (
    1, 'reserve_to_agent', -amount_to_grant, reserve_before, reserve_after,
    auth.uid(), _agent_id, _agent_id,
    COALESCE(_notes, 'Allocation to ' || COALESCE(agent_name, 'agent'))
  );

  PERFORM public.notify_reserve_low();
  RETURN jsonb_build_object('success', true, 'balance', reserve_after);
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
  sender_currency text;
  receiver_currency text;
  amount_to_send numeric(18, 2);
  transaction_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role::text = 'agent'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only agents can distribute funds.');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled.');
  END IF;
  IF _receiver_id IS NULL OR _receiver_id = auth.uid()
     OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose another user and enter a valid amount.');
  END IF;

  amount_to_send := round(_amount, 2);
  IF amount_to_send <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be at least one cent.');
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = _receiver_id
       AND role::text IN ('client', 'vendor')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient must be a client or vendor.');
  END IF;

  SELECT balance, currency
    INTO sender_balance, sender_currency
    FROM public.wallets
   WHERE user_id = auth.uid()
   FOR UPDATE;

  IF COALESCE(sender_balance, 0) < amount_to_send THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient agent balance.');
  END IF;

  SELECT currency
    INTO receiver_currency
    FROM public.wallets
   WHERE user_id = _receiver_id
   FOR UPDATE;

  IF FOUND AND receiver_currency IS DISTINCT FROM sender_currency THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender and recipient wallet currencies do not match.');
  END IF;

  UPDATE public.wallets
     SET balance = balance - amount_to_send,
         updated_at = now()
   WHERE user_id = auth.uid();

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_receiver_id, amount_to_send, COALESCE(sender_currency, 'USD'))
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();

  INSERT INTO public.transactions (
    sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at
  )
  VALUES (
    auth.uid(), _receiver_id, amount_to_send, 0, 'completed', 'agent_distribution',
    COALESCE(_description, 'Agent distribution'), now()
  )
  RETURNING id INTO transaction_id;

  RETURN jsonb_build_object('success', true, 'transaction_id', transaction_id);
END;
$$;

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
  amount_to_add numeric(18, 2);
  reserve_before numeric(18, 2);
  reserve_after numeric(18, 2);
  reserve_currency text;
  wallet_before numeric;
  wallet_after numeric;
  wallet_currency text;
  transaction_id uuid;
  audit_id uuid;
  audit_created_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled.');
  END IF;
  IF _user_id IS NULL OR _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid user and positive amount.');
  END IF;

  amount_to_add := round(_amount, 2);
  IF amount_to_add <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be at least one cent.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User account not found.');
  END IF;

  SELECT balance, currency
    INTO reserve_before, reserve_currency
    FROM public.bank_reserve
   WHERE id = 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bank reserve is not configured.');
  END IF;
  IF reserve_before < amount_to_add THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient bank reserve.');
  END IF;

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (_user_id, 0, reserve_currency)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, currency
    INTO wallet_before, wallet_currency
    FROM public.wallets
   WHERE user_id = _user_id
   FOR UPDATE;

  UPDATE public.wallets
     SET balance = balance + amount_to_add,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING balance, currency INTO wallet_after, wallet_currency;

  UPDATE public.bank_reserve
     SET balance = balance - amount_to_add,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = 1
   RETURNING balance INTO reserve_after;

  IF auth.uid() <> _user_id THEN
    INSERT INTO public.transactions (
      sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at
    )
    VALUES (
      auth.uid(), _user_id, amount_to_add, 0, 'completed', 'deposit', 'Admin deposit', now()
    )
    RETURNING id INTO transaction_id;
  END IF;

  INSERT INTO public.bank_reserve_ledger (
    reserve_id, entry_type, amount, balance_before, balance_after,
    actor_id, related_user_id, notes
  )
  VALUES (
    1, 'reserve_to_user', -amount_to_add, reserve_before, reserve_after,
    auth.uid(), _user_id, 'Admin reserve-backed deposit'
  );

  INSERT INTO public.admin_fund_audit_log (
    actor_id, target_user_id, transaction_id, amount, currency,
    balance_before, balance_after
  )
  VALUES (
    auth.uid(), _user_id, transaction_id, amount_to_add,
    COALESCE(wallet_currency, reserve_currency, 'GYD'),
    wallet_before, wallet_after
  )
  RETURNING id, created_at INTO audit_id, audit_created_at;

  PERFORM public.notify_reserve_low();
  RETURN jsonb_build_object(
    'success', true,
    'audit_id', audit_id,
    'transaction_id', transaction_id,
    'balance_before', wallet_before,
    'balance_after', wallet_after,
    'reserve_balance', reserve_after,
    'currency', COALESCE(wallet_currency, reserve_currency, 'GYD'),
    'created_at', audit_created_at
  );
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
  IF auth.uid() IS NULL OR NOT public.is_reserve_manager(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF NOT public.internal_funds_enabled() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Internal funds are disabled.');
  END IF;

  SELECT *
    INTO deposit_row
    FROM public.pending_deposits
   WHERE id = _deposit_id
     AND status = 'pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pending deposit not found or already processed.');
  END IF;

  funding_result := public.admin_add_funds(deposit_row.user_id, deposit_row.amount);
  IF COALESCE((funding_result ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN funding_result;
  END IF;

  UPDATE public.pending_deposits
     SET status = 'approved',
         approved_by = auth.uid(),
         processed_at = now()
   WHERE id = _deposit_id;

  RETURN jsonb_build_object('success', true, 'funding', funding_result);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_bank_reserve_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bank_reserve(numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_bank_reserve_to_agent(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_distribute_funds(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_add_funds(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_pending_deposit(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bank_reserve_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bank_reserve(numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_bank_reserve_to_agent(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_distribute_funds(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_funds(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_pending_deposit(uuid) TO authenticated;

-- Public downloads are required for the release URLs; file changes remain admin-only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-releases', 'app-releases', true)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      public = true;

DROP POLICY IF EXISTS "anyone downloads app files" ON storage.objects;
CREATE POLICY "anyone downloads app files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'app-releases');

DROP POLICY IF EXISTS "admins upload app files" ON storage.objects;
CREATE POLICY "admins upload app files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app-releases'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "admins update app files" ON storage.objects;
CREATE POLICY "admins update app files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'app-releases'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'app-releases'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "admins delete app files" ON storage.objects;
CREATE POLICY "admins delete app files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'app-releases'
    AND public.has_role(auth.uid(), 'admin')
  );

NOTIFY pgrst, 'reload schema';

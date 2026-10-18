-- Enforce per-user feature access at the database boundary for customer
-- financial writes, and retain an append-only history of staff changes.

CREATE OR REPLACE FUNCTION public.user_feature_access_is_enabled(
  _user_id uuid,
  _feature_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_enabled boolean;
  _global_enabled boolean;
BEGIN
  IF _user_id IS NULL OR NULLIF(BTRIM(_feature_key), '') IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'admin')
     OR public.has_role(_user_id, 'founder') THEN
    RETURN true;
  END IF;

  SELECT access.is_enabled
    INTO _user_enabled
    FROM public.user_feature_access AS access
   WHERE access.user_id = _user_id
     AND access.feature_key = _feature_key;

  SELECT toggle.is_enabled
    INTO _global_enabled
    FROM public.feature_toggles AS toggle
   WHERE toggle.feature_key = _feature_key;

  RETURN COALESCE(_user_enabled, true) AND COALESCE(_global_enabled, true);
END;
$$;

REVOKE ALL ON FUNCTION public.user_feature_access_is_enabled(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- Feature-specific transaction names are enforced by the trigger below rather
-- than the older four-value check from the initial transaction schema.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_transaction_type_check;

CREATE OR REPLACE FUNCTION public.guard_transaction_feature_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _feature_key text;
BEGIN
  -- Scheduled workers and trusted server jobs have no end-user JWT.
  IF _actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(_actor_id, 'admin')
     OR public.has_role(_actor_id, 'founder') THEN
    RETURN NEW;
  END IF;

  -- Agent cash withdrawals are a staff workflow, not a client-menu feature.
  IF NEW.transaction_type = 'withdrawal'
     AND public.has_role(_actor_id, 'agent') THEN
    RETURN NEW;
  END IF;

  IF NEW.sender_id IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'You cannot create a transaction for another account.';
  END IF;

  _feature_key := CASE LOWER(BTRIM(NEW.transaction_type))
    WHEN 'transfer' THEN 'client_menu_send_money'
    WHEN 'nfc_payment' THEN 'client_menu_nfc_payment'
    WHEN 'scan_to_pay' THEN 'client_menu_scan_to_pay'
    WHEN 'merchant_payment' THEN 'client_menu_pay_merchant'
    WHEN 'purchase' THEN 'client_menu_shop'
    WHEN 'international_transfer' THEN 'client_menu_international_transfers'
    WHEN 'bill_payment' THEN 'client_menu_pay_bills'
    WHEN 'deposit' THEN 'client_menu_add_money'
    WHEN 'investment_purchase' THEN 'client_menu_investments'
    WHEN 'cashback_redemption' THEN 'client_menu_rewards'
    WHEN 'blockchain_transfer' THEN 'client_menu_send_money'
    ELSE NULL
  END;

  IF _feature_key IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This transaction type is not available for direct client writes.';
  END IF;

  IF LOWER(BTRIM(NEW.transaction_type)) IN ('merchant_payment', 'purchase')
     AND NOT public.has_role(NEW.receiver_id, 'vendor') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Merchant payments must be sent to a registered vendor account.';
  END IF;

  IF NOT public.user_feature_access_is_enabled(_actor_id, _feature_key) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'This feature is disabled for your account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_transaction_feature_access ON public.transactions;
CREATE TRIGGER guard_transaction_feature_access
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_transaction_feature_access();
REVOKE ALL ON FUNCTION public.guard_transaction_feature_access()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_fund_request_feature_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL
     OR public.has_role(_actor_id, 'admin')
     OR public.has_role(_actor_id, 'founder') THEN
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'You cannot create a fund request for another account.';
  END IF;

  IF NOT public.user_feature_access_is_enabled(_actor_id, 'client_menu_request_funds') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Fund requests are disabled for your account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_fund_request_feature_access ON public.fund_requests;
CREATE TRIGGER guard_fund_request_feature_access
  BEFORE INSERT ON public.fund_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fund_request_feature_access();
REVOKE ALL ON FUNCTION public.guard_fund_request_feature_access()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_fund_reversal_feature_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL
     OR public.has_role(_actor_id, 'admin')
     OR public.has_role(_actor_id, 'founder') THEN
    RETURN NEW;
  END IF;

  IF NEW.requester_id IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'You cannot create a reversal request for another account.';
  END IF;

  IF NOT public.user_feature_access_is_enabled(_actor_id, 'client_menu_reverse_funds') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Fund reversals are disabled for your account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_fund_reversal_feature_access ON public.fund_reversals;
CREATE TRIGGER guard_fund_reversal_feature_access
  BEFORE INSERT ON public.fund_reversals
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fund_reversal_feature_access();
REVOKE ALL ON FUNCTION public.guard_fund_reversal_feature_access()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_pending_deposit_feature_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
BEGIN
  IF _actor_id IS NULL
     OR public.has_role(_actor_id, 'admin')
     OR public.has_role(_actor_id, 'founder') THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(_actor_id, 'agent')
     OR NEW.agent_id IS DISTINCT FROM _actor_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Only the signed-in agent can create a pending deposit.';
  END IF;

  IF NOT public.user_feature_access_is_enabled(NEW.user_id, 'client_menu_add_money') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Adding money is disabled for this account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_pending_deposit_feature_access ON public.pending_deposits;
CREATE TRIGGER guard_pending_deposit_feature_access
  BEFORE INSERT ON public.pending_deposits
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_pending_deposit_feature_access();
REVOKE ALL ON FUNCTION public.guard_pending_deposit_feature_access()
  FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.user_feature_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'founder')),
  user_id uuid NOT NULL,
  feature_key text NOT NULL CHECK (feature_key ~ '^client_menu_[a-z0-9_]+$'),
  old_is_enabled boolean NOT NULL,
  new_is_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_feature_access_audit_user_created
  ON public.user_feature_access_audit (user_id, created_at DESC);

ALTER TABLE public.user_feature_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_feature_access_audit FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_feature_access_audit FROM service_role;
GRANT SELECT ON TABLE public.user_feature_access_audit TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_feature_access_with_audit(
  _actor_id uuid,
  _user_id uuid,
  _feature_key text,
  _is_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_role text;
  _old_is_enabled boolean;
  _user_exists boolean;
BEGIN
  IF _actor_id IS NULL OR _user_id IS NULL OR _is_enabled IS NULL
     OR _feature_key IS NULL
     OR _feature_key !~ '^client_menu_[a-z0-9_]+$' THEN
    RAISE EXCEPTION 'A valid actor, user, client-menu feature, and enabled state are required.';
  END IF;

  IF public.has_role(_actor_id, 'founder') THEN
    _actor_role := 'founder';
  ELSIF public.has_role(_actor_id, 'admin') THEN
    _actor_role := 'admin';
  ELSE
    RAISE EXCEPTION 'Only admins and founders can change user feature access.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE id = _user_id
  ) INTO _user_exists;
  IF NOT _user_exists THEN
    RAISE EXCEPTION 'User account not found.';
  END IF;

  IF public.has_role(_user_id, 'admin')
     OR public.has_role(_user_id, 'founder') THEN
    RAISE EXCEPTION 'Admin and founder accounts cannot be managed here.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':' || _feature_key, 0::bigint)
  );

  SELECT access.is_enabled
    INTO _old_is_enabled
    FROM public.user_feature_access AS access
   WHERE access.user_id = _user_id
     AND access.feature_key = _feature_key
   FOR UPDATE;
  _old_is_enabled := COALESCE(_old_is_enabled, true);

  INSERT INTO public.user_feature_access (
    user_id, feature_key, is_enabled, updated_by, updated_at
  )
  VALUES (_user_id, _feature_key, _is_enabled, _actor_id, now())
  ON CONFLICT (user_id, feature_key) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.user_feature_access_audit (
    actor_id, actor_role, user_id, feature_key, old_is_enabled, new_is_enabled
  )
  VALUES (_actor_id, _actor_role, _user_id, _feature_key, _old_is_enabled, _is_enabled);

  RETURN jsonb_build_object(
    'ok', true,
    'userId', _user_id,
    'featureKey', _feature_key,
    'is_enabled', _is_enabled,
    'old_is_enabled', _old_is_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_feature_access_with_audit(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_feature_access_with_audit(uuid, uuid, text, boolean)
  TO service_role;

NOTIFY pgrst, 'reload schema';

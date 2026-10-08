-- SQL-update.sql — every database function this app needs.
-- Safe to re-run: uses CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- Run in the Supabase SQL editor or pgAdmin as the postgres user.
-- Assumes your tables already exist (see all_migrations.sql).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','agent','client','vendor'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.ledger_idempotency_keys (id text PRIMARY KEY, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.ledger_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS chain_tx_hash text, ADD COLUMN IF NOT EXISTS chain_block_number bigint, ADD COLUMN IF NOT EXISTS chain_status text NOT NULL DEFAULT 'off_chain';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;

-- ===== Part 1: core functions (exported from the live database) =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.process_transaction(_sender_id uuid, _receiver_id uuid, _amount numeric, _transaction_type text, _description text DEFAULT NULL::text)
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
$function$
;

CREATE OR REPLACE FUNCTION public.process_private_ledger_transfer(_receiver_id uuid, _amount numeric, _transaction_type text, _description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_add_funds(_user_id uuid, _amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Add funds to user wallet
  UPDATE public.wallets
  SET balance = balance + _amount,
      updated_at = now()
  WHERE user_id = _user_id;

  -- Create transaction record
  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin deposit', now());

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_fund_reversal(_reversal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reversal record;
  _recipient_balance numeric;
BEGIN
  -- Check caller is admin or agent
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get reversal details
  SELECT * INTO _reversal FROM public.fund_reversals WHERE id = _reversal_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal not found or already processed');
  END IF;

  -- Lock recipient wallet
  SELECT balance INTO _recipient_balance FROM public.wallets WHERE user_id = _reversal.recipient_id FOR UPDATE;

  IF _recipient_balance < _reversal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient has insufficient balance for reversal');
  END IF;

  -- Deduct from wrong recipient immediately
  UPDATE public.wallets SET balance = balance - _reversal.amount, updated_at = now() WHERE user_id = _reversal.recipient_id;

  -- Update reversal status to approved with hold time
  UPDATE public.fund_reversals
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      funds_held_at = now()
  WHERE id = _reversal_id;

  -- Notify recipient that funds were reversed
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_reversal.recipient_id, 'Fund Reversal', 'A reversal of $' || _reversal.amount || ' has been processed from your account.', 'warning');

  -- Notify requester that reversal was approved (funds return in 1 hour)
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_reversal.requester_id, 'Reversal Approved', 'Your reversal request for $' || _reversal.amount || ' was approved. Funds will return to your account within 1 hour.', 'success');

  RETURN jsonb_build_object('success', true, 'message', 'Funds deducted from recipient. Will be returned to sender in 1 hour.');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.flag_suspicious_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _recent_count int;
BEGIN
  IF NEW.status = 'completed' THEN
    -- Large amount
    IF NEW.amount >= 10000 THEN
      INSERT INTO public.suspicious_activity_alerts (user_id, alert_type, severity, description, metadata)
      VALUES (NEW.sender_id, 'large_transaction', 'high',
        'Large transaction of $' || NEW.amount || ' detected',
        jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount));
    END IF;

    -- Rapid transactions
    SELECT COUNT(*) INTO _recent_count FROM public.transactions
      WHERE sender_id = NEW.sender_id
        AND created_at > now() - interval '5 minutes'
        AND status = 'completed';
    IF _recent_count >= 5 THEN
      INSERT INTO public.suspicious_activity_alerts (user_id, alert_type, severity, description, metadata)
      VALUES (NEW.sender_id, 'rapid_transactions', 'medium',
        _recent_count || ' transactions in last 5 minutes',
        jsonb_build_object('count', _recent_count));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  account_type text;
  user_role app_role;
BEGIN
  -- Get account_type from raw_user_meta_data
  account_type := (NEW.raw_user_meta_data->>'account_type')::text;
  
  -- Determine role based on account_type (default to 'client')
  IF account_type = 'vendor' THEN
    user_role := 'vendor'::app_role;
  ELSE
    user_role := 'client'::app_role;
  END IF;
  
  -- Insert profile
  INSERT INTO public.profiles (id, full_name, phone_number, wallet_address, wallet_created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NEW.raw_user_meta_data->>'wallet_address',
    CASE WHEN NEW.raw_user_meta_data->>'wallet_address' IS NOT NULL THEN now() ELSE NULL END
  );
  
  -- Insert wallet with 0 balance
  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (NEW.id, 0, 'USD');
  
  -- Insert user role based on account_type
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.hash_pin(pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN encode(extensions.digest(pin, 'sha256'), 'hex');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_audit_event(_action text, _entity_type text DEFAULT NULL::text, _entity_id text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _role text;
BEGIN
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _role, _action, _entity_type, _entity_id, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sender_name text;
  _receiver_name text;
BEGIN
  -- Only notify on completed transactions
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get names
  SELECT full_name INTO _sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT full_name INTO _receiver_name FROM profiles WHERE id = NEW.receiver_id;

  -- Notify receiver: payment received
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    NEW.receiver_id,
    'Payment Received',
    'You received $' || NEW.amount || ' from ' || COALESCE(_sender_name, 'someone'),
    'success'
  );

  -- Notify sender: payment sent confirmation
  IF NEW.transaction_type = 'transfer' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.sender_id,
      'Payment Sent',
      'You sent $' || NEW.amount || ' to ' || COALESCE(_receiver_name, 'someone'),
      'info'
    );
  ELSIF NEW.transaction_type = 'deposit' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.receiver_id,
      'Deposit Received',
      'Your account was credited with $' || NEW.amount,
      'success'
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_pending_reversals()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _reversal record;
  _processed int := 0;
BEGIN
  FOR _reversal IN
    SELECT * FROM public.fund_reversals
    WHERE status = 'approved'
    AND funds_held_at IS NOT NULL
    AND funds_held_at + interval '1 hour' <= now()
  LOOP
    -- Return funds to original sender
    UPDATE public.wallets SET balance = balance + _reversal.amount, updated_at = now() WHERE user_id = _reversal.requester_id;

    -- Mark reversal as completed
    UPDATE public.fund_reversals SET status = 'completed', funds_returned_at = now() WHERE id = _reversal.id;

    -- Notify sender
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (_reversal.requester_id, 'Funds Returned', '$' || _reversal.amount || ' has been returned to your account.', 'success');

    _processed := _processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', _processed);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_private_ledger_transfer_v2(_receiver_id uuid, _amount numeric, _transaction_type text, _idempotency_key text DEFAULT NULL::text, _description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ BEGIN IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated.'); END IF; IF _idempotency_key IS NOT NULL THEN BEGIN INSERT INTO public.ledger_idempotency_keys (id, user_id) VALUES (_idempotency_key, auth.uid()); EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success', false, 'error', 'This transfer was already submitted.', 'duplicate', true); END; END IF; RETURN public.process_private_ledger_transfer(_receiver_id, _amount, _transaction_type, _description); END; $function$
;

CREATE OR REPLACE FUNCTION public.record_chain_receipt(_transaction_id uuid, _block_number bigint, _tx_hash text DEFAULT NULL::text, _status text DEFAULT 'anchored'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET pin_hash = encode(extensions.digest(user_pin, 'sha256'), 'hex')
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_pin(user_id uuid, pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT pin_hash INTO stored_hash FROM profiles WHERE id = user_id;
  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN stored_hash = encode(extensions.digest(pin, 'sha256'), 'hex');
END;
$function$
;

-- ===== Part 2: triggers =====
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER on_transaction_completed AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION notify_transaction();
CREATE TRIGGER trg_2fa_updated_at BEFORE UPDATE ON public.two_factor_auth FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_announcements_updated_at BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_countries_updated_at BEFORE UPDATE ON public.countries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_flag_suspicious_transaction AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION flag_suspicious_transaction();
CREATE TRIGGER trg_kyc_updated_at BEFORE UPDATE ON public.kyc_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_blockchain_settings_updated_at BEFORE UPDATE ON public.blockchain_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversion_fees_updated_at BEFORE UPDATE ON public.conversion_fees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feature_toggles_updated_at BEFORE UPDATE ON public.feature_toggles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_supported_coins_updated_at BEFORE UPDATE ON public.supported_coins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vendor_products_updated_at BEFORE UPDATE ON public.vendor_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_transaction_completed ON public.transactions;
DROP TRIGGER IF EXISTS trg_2fa_updated_at ON public.two_factor_auth;
DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
DROP TRIGGER IF EXISTS trg_countries_updated_at ON public.countries;
DROP TRIGGER IF EXISTS trg_flag_suspicious_transaction ON public.transactions;
DROP TRIGGER IF EXISTS trg_kyc_updated_at ON public.kyc_submissions;
DROP TRIGGER IF EXISTS update_blockchain_settings_updated_at ON public.blockchain_settings;
DROP TRIGGER IF EXISTS update_conversion_fees_updated_at ON public.conversion_fees;
DROP TRIGGER IF EXISTS update_feature_toggles_updated_at ON public.feature_toggles;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_supported_coins_updated_at ON public.supported_coins;
DROP TRIGGER IF EXISTS update_vendor_products_updated_at ON public.vendor_products;
DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;

-- ===== Part 3: bank reserve, agent distribution, deposit approval, admin metrics =====
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
-- ===== Part 4: permissions =====
REVOKE EXECUTE ON FUNCTION public.process_transaction(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_private_ledger_transfer(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_private_ledger_transfer_v2(uuid, numeric, text, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';

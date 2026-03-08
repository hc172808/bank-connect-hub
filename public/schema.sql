-- ============================================
-- GYD App - Complete Database Schema
-- Generated: 2026-03-08
-- Compatible with: PostgreSQL / Supabase
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.app_role AS ENUM ('admin', 'agent', 'client', 'vendor');

-- ============================================
-- TABLES
-- ============================================

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone_number text,
  avatar_url text,
  address text,
  city text,
  country text,
  bio text,
  date_of_birth date,
  wallet_address text,
  wallet_created_at timestamptz,
  store_name text,
  pin_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Wallets
CREATE TABLE public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0.00,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- User Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- User Wallets (blockchain)
CREATE TABLE public.user_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_address text NOT NULL,
  encrypted_private_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transactions
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  amount numeric NOT NULL,
  fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  transaction_type text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Transaction Fees
CREATE TABLE public.transaction_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL,
  fee_percentage numeric NOT NULL DEFAULT 0,
  fixed_fee numeric NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fund Requests
CREATE TABLE public.fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  payer_id uuid NOT NULL,
  amount numeric NOT NULL,
  verification_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fund Reversals
CREATE TABLE public.fund_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  funds_held_at timestamptz,
  funds_returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pending Deposits (agent-initiated)
CREATE TABLE public.pending_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Blockchain Settings
CREATE TABLE public.blockchain_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_url text,
  rpc_urls jsonb DEFAULT '[]'::jsonb,
  chain_id text,
  native_coin_symbol text NOT NULL DEFAULT 'GYD',
  native_coin_name text NOT NULL DEFAULT 'GYD Coin',
  explorer_url text,
  liquidity_pool_address text,
  fee_wallet_address text,
  fee_wallet_encrypted_key text,
  gas_fee_gyd numeric NOT NULL DEFAULT 0.01,
  is_active boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Supported Coins
CREATE TABLE public.supported_coins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coin_symbol text NOT NULL,
  coin_name text NOT NULL,
  contract_address text,
  is_native boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Conversion Fees
CREATE TABLE public.conversion_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_coin text NOT NULL,
  to_coin text NOT NULL,
  fee_percentage numeric NOT NULL DEFAULT 1.0,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Feature Toggles
CREATE TABLE public.feature_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  feature_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Gas Fee Ledger
CREATE TABLE public.gas_fee_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric NOT NULL,
  transaction_type text NOT NULL,
  description text,
  related_transaction_id uuid,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Biometric Credentials
CREATE TABLE public.biometric_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL,
  public_key text NOT NULL,
  auth_type text NOT NULL DEFAULT 'fingerprint',
  device_name text DEFAULT 'Unknown Device',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Vendor Products
CREATE TABLE public.vendor_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  price numeric NOT NULL,
  discount_price numeric,
  logo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Vendor Registration Fees
CREATE TABLE public.vendor_registration_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_name text NOT NULL DEFAULT 'Vendor Registration Fee',
  fee_amount numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- External Databases
CREATE TABLE public.external_databases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  host text NOT NULL,
  port integer NOT NULL DEFAULT 5432,
  database_name text NOT NULL,
  username text NOT NULL,
  secret_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Database Backups
CREATE TABLE public.database_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_name text NOT NULL,
  backup_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  file_size bigint,
  external_db_id uuid REFERENCES public.external_databases(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mobile Money Providers
CREATE TABLE public.mobile_money_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ussd_code text,
  logo_letter text NOT NULL DEFAULT '?',
  color text NOT NULL DEFAULT 'bg-muted-foreground',
  merchant_number text,
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supported_coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gas_fee_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_registration_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_databases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_money_providers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Handle new user signup (trigger function)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  account_type text;
  user_role app_role;
BEGIN
  account_type := (NEW.raw_user_meta_data->>'account_type')::text;
  
  IF account_type = 'vendor' THEN
    user_role := 'vendor'::app_role;
  ELSE
    user_role := 'client'::app_role;
  END IF;
  
  INSERT INTO public.profiles (id, full_name, phone_number, wallet_address, wallet_created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NEW.raw_user_meta_data->>'wallet_address',
    CASE WHEN NEW.raw_user_meta_data->>'wallet_address' IS NOT NULL THEN now() ELSE NULL END
  );
  
  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (NEW.id, 0, 'USD');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

-- Update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Set user PIN
CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles SET pin_hash = encode(extensions.digest(user_pin, 'sha256'), 'hex')
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

-- Verify PIN
CREATE OR REPLACE FUNCTION public.verify_pin(user_id uuid, pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT pin_hash INTO stored_hash FROM profiles WHERE id = user_id;
  IF stored_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN stored_hash = encode(extensions.digest(pin, 'sha256'), 'hex');
END;
$$;

-- Hash PIN
CREATE OR REPLACE FUNCTION public.hash_pin(pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN encode(extensions.digest(pin, 'sha256'), 'hex');
END;
$$;

-- Admin add funds
CREATE OR REPLACE FUNCTION public.admin_add_funds(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.wallets SET balance = balance + _amount, updated_at = now() WHERE user_id = _user_id;

  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin deposit', now());

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Process transaction
CREATE OR REPLACE FUNCTION public.process_transaction(
  _sender_id uuid, _receiver_id uuid, _amount numeric,
  _transaction_type text, _description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  SELECT public.has_role(_sender_id, 'admin') INTO _is_admin;

  SELECT balance INTO _sender_balance FROM public.wallets WHERE user_id = _sender_id FOR UPDATE;

  SELECT fee_percentage, fixed_fee INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees WHERE transaction_type = _transaction_type;

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
    UPDATE public.wallets SET balance = balance - _total_amount, updated_at = now() WHERE user_id = _sender_id;
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_receiver_id, _amount)
  ON CONFLICT (user_id) DO UPDATE SET balance = wallets.balance + _amount, updated_at = now();

  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (_sender_id, _receiver_id, _amount, _total_fee, 'completed', _transaction_type, _description, now())
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object(
    'success', true, 'transaction_id', _transaction_id,
    'fee', _total_fee, 'sender_cashback', _sender_cashback, 'liquidity_pool_fee', _liquidity_pool_fee
  );
END;
$$;

-- Notify on transaction
CREATE OR REPLACE FUNCTION public.notify_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_name text;
  _receiver_name text;
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT full_name INTO _sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT full_name INTO _receiver_name FROM profiles WHERE id = NEW.receiver_id;

  INSERT INTO notifications (user_id, title, message, type)
  VALUES (NEW.receiver_id, 'Payment Received', 'You received $' || NEW.amount || ' from ' || COALESCE(_sender_name, 'someone'), 'success');

  IF NEW.transaction_type = 'transfer' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (NEW.sender_id, 'Payment Sent', 'You sent $' || NEW.amount || ' to ' || COALESCE(_receiver_name, 'someone'), 'info');
  ELSIF NEW.transaction_type = 'deposit' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (NEW.receiver_id, 'Deposit Received', 'Your account was credited with $' || NEW.amount, 'success');
  END IF;

  RETURN NEW;
END;
$$;

-- Approve fund reversal
CREATE OR REPLACE FUNCTION public.approve_fund_reversal(_reversal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reversal record;
  _recipient_balance numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _reversal FROM public.fund_reversals WHERE id = _reversal_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal not found or already processed');
  END IF;

  SELECT balance INTO _recipient_balance FROM public.wallets WHERE user_id = _reversal.recipient_id FOR UPDATE;
  IF _recipient_balance < _reversal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient has insufficient balance for reversal');
  END IF;

  UPDATE public.wallets SET balance = balance - _reversal.amount, updated_at = now() WHERE user_id = _reversal.recipient_id;

  UPDATE public.fund_reversals
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(), funds_held_at = now()
  WHERE id = _reversal_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_reversal.recipient_id, 'Fund Reversal', 'A reversal of $' || _reversal.amount || ' has been processed from your account.', 'warning');

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_reversal.requester_id, 'Reversal Approved', 'Your reversal request for $' || _reversal.amount || ' was approved. Funds will return within 1 hour.', 'success');

  RETURN jsonb_build_object('success', true, 'message', 'Funds deducted. Will return to sender in 1 hour.');
END;
$$;

-- Process pending reversals (1-hour delay)
CREATE OR REPLACE FUNCTION public.process_pending_reversals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reversal record;
  _processed int := 0;
BEGIN
  FOR _reversal IN
    SELECT * FROM public.fund_reversals
    WHERE status = 'approved' AND funds_held_at IS NOT NULL
    AND funds_held_at + interval '1 hour' <= now()
  LOOP
    UPDATE public.wallets SET balance = balance + _reversal.amount, updated_at = now() WHERE user_id = _reversal.requester_id;
    UPDATE public.fund_reversals SET status = 'completed', funds_returned_at = now() WHERE id = _reversal.id;
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (_reversal.requester_id, 'Funds Returned', '$' || _reversal.amount || ' has been returned to your account.', 'success');
    _processed := _processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', _processed);
END;
$$;

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create profile on signup (attach to auth.users)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Notify on transaction completion
CREATE TRIGGER on_transaction_complete
  AFTER INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_transaction();

-- Auto-update updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update updated_at on wallets
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Everyone can view vendor store names" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = profiles.id AND user_roles.role = 'vendor'));

-- Wallets
CREATE POLICY "Users can view their own wallet" ON public.wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own wallet" ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own wallet" ON public.wallets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Agents can view client wallets" ON public.wallets FOR SELECT USING (has_role(auth.uid(), 'agent') OR has_role(auth.uid(), 'admin'));

-- User Roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- User Wallets (blockchain)
CREATE POLICY "Users can view their own wallet" ON public.user_wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own wallet" ON public.user_wallets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all wallets" ON public.user_wallets FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Transactions
CREATE POLICY "Users can view their own transactions" ON public.transactions FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can create transactions" ON public.transactions FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (has_role(auth.uid(), 'admin'));

-- Transaction Fees
CREATE POLICY "Everyone can view fees" ON public.transaction_fees FOR SELECT USING (true);
CREATE POLICY "Admins can manage fees" ON public.transaction_fees FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all notifications" ON public.notifications FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert notifications" ON public.notifications FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Fund Requests
CREATE POLICY "Users can create fund requests" ON public.fund_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can view their fund requests" ON public.fund_requests FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = payer_id);
CREATE POLICY "Payers can update fund request status" ON public.fund_requests FOR UPDATE USING (auth.uid() = payer_id);

-- Fund Reversals
CREATE POLICY "Users can create reversal requests" ON public.fund_reversals FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can view their own reversals" ON public.fund_reversals FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = recipient_id);
CREATE POLICY "Admins can view all reversals" ON public.fund_reversals FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update reversals" ON public.fund_reversals FOR UPDATE USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Agents can view all reversals" ON public.fund_reversals FOR SELECT USING (has_role(auth.uid(), 'agent'));
CREATE POLICY "Agents can update reversals" ON public.fund_reversals FOR UPDATE USING (has_role(auth.uid(), 'agent'));

-- Pending Deposits
CREATE POLICY "Agents can create deposits" ON public.pending_deposits FOR INSERT WITH CHECK (auth.uid() = agent_id AND has_role(auth.uid(), 'agent'));
CREATE POLICY "Agents can view their pending deposits" ON public.pending_deposits FOR SELECT USING (auth.uid() = agent_id OR has_role(auth.uid(), 'agent'));
CREATE POLICY "Admins can view all pending deposits" ON public.pending_deposits FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can approve deposits" ON public.pending_deposits FOR UPDATE USING (has_role(auth.uid(), 'admin'));

-- Blockchain Settings
CREATE POLICY "Everyone can view blockchain settings" ON public.blockchain_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage blockchain settings" ON public.blockchain_settings FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Supported Coins
CREATE POLICY "Everyone can view supported coins" ON public.supported_coins FOR SELECT USING (true);
CREATE POLICY "Admins can manage supported coins" ON public.supported_coins FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Conversion Fees
CREATE POLICY "Everyone can view conversion fees" ON public.conversion_fees FOR SELECT USING (true);
CREATE POLICY "Admins can manage conversion fees" ON public.conversion_fees FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Feature Toggles
CREATE POLICY "Everyone can view feature toggles" ON public.feature_toggles FOR SELECT USING (true);
CREATE POLICY "Admins can manage feature toggles" ON public.feature_toggles FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Gas Fee Ledger
CREATE POLICY "Admins can manage gas fee ledger" ON public.gas_fee_ledger FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Biometric Credentials
CREATE POLICY "Users can view their own biometric credentials" ON public.biometric_credentials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own biometric credentials" ON public.biometric_credentials FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own biometric credentials" ON public.biometric_credentials FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own biometric credentials" ON public.biometric_credentials FOR DELETE USING (auth.uid() = user_id);

-- Vendor Products
CREATE POLICY "Everyone can view active products" ON public.vendor_products FOR SELECT USING (is_active = true);
CREATE POLICY "Vendors can manage their own products" ON public.vendor_products FOR ALL USING (auth.uid() = vendor_id);

-- Vendor Registration Fees
CREATE POLICY "Everyone can view vendor registration fees" ON public.vendor_registration_fees FOR SELECT USING (true);
CREATE POLICY "Admins can manage vendor registration fees" ON public.vendor_registration_fees FOR ALL USING (has_role(auth.uid(), 'admin'));

-- External Databases
CREATE POLICY "Admins can manage external databases" ON public.external_databases FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Database Backups
CREATE POLICY "Admins can manage database backups" ON public.database_backups FOR ALL USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- REALTIME (optional - enable for tables needing live updates)
-- ============================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- ============================================
-- SEED DATA
-- ============================================

-- Default blockchain settings with RPC nodes
INSERT INTO public.blockchain_settings (rpc_url, rpc_urls, chain_id, native_coin_symbol, native_coin_name, is_active)
VALUES (
  'https://rpc.netlifegy.com',
  '[
    {"url": "https://rpc.netlifegy.com", "label": "Primary RPC", "priority": 1},
    {"url": "https://rpc2.netlifegy.com", "label": "Backup RPC 2", "priority": 2},
    {"url": "https://rpc3.netlifegy.com", "label": "Backup RPC 3", "priority": 3},
    {"url": "https://localhost:8546", "label": "Local Node", "priority": 4},
    {"url": "https://192.168.18.106:8546", "label": "LAN Node", "priority": 5}
  ]'::jsonb,
  '1337',
  'GYD',
  'GYD Coin',
  false
);

-- Default supported coin
INSERT INTO public.supported_coins (coin_symbol, coin_name, is_native, is_active)
VALUES ('GYD', 'GYD Coin', true, true);

-- ============================================
-- SAMPLE USERS (via Supabase Auth)
-- ============================================
-- NOTE: In Supabase, users are created via auth.users which triggers handle_new_user().
-- Below we insert directly into profiles/wallets/user_roles for standalone PostgreSQL usage.
-- For Supabase, create users via the Auth API or dashboard instead.

-- Admin User
-- Email: admin@gyd.com | Password: set via Supabase Auth
INSERT INTO public.profiles (id, full_name, phone_number)
VALUES ('00000000-0000-0000-0000-000000000001', 'GYD Admin', '+1234567890');

INSERT INTO public.wallets (user_id, balance, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 999999.00, 'USD');

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin');

-- Agent 1
INSERT INTO public.profiles (id, full_name, phone_number, address, city, country)
VALUES ('00000000-0000-0000-0000-000000000002', 'Agent Smith', '+1234567891', '123 Main St', 'Georgetown', 'Guyana');

INSERT INTO public.wallets (user_id, balance, currency)
VALUES ('00000000-0000-0000-0000-000000000002', 5000.00, 'USD');

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'agent');

-- Agent 2
INSERT INTO public.profiles (id, full_name, phone_number, address, city, country)
VALUES ('00000000-0000-0000-0000-000000000003', 'Agent Johnson', '+1234567892', '456 Market Rd', 'Linden', 'Guyana');

INSERT INTO public.wallets (user_id, balance, currency)
VALUES ('00000000-0000-0000-0000-000000000003', 3000.00, 'USD');

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000003', 'agent');

-- Test Client
INSERT INTO public.profiles (id, full_name, phone_number)
VALUES ('00000000-0000-0000-0000-000000000004', 'Test User', '+1234567893');

INSERT INTO public.wallets (user_id, balance, currency)
VALUES ('00000000-0000-0000-0000-000000000004', 100.00, 'USD');

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000004', 'client');

-- Test Vendor
INSERT INTO public.profiles (id, full_name, phone_number, store_name)
VALUES ('00000000-0000-0000-0000-000000000005', 'Vendor Shop', '+1234567894', 'GYD General Store');

INSERT INTO public.wallets (user_id, balance, currency)
VALUES ('00000000-0000-0000-0000-000000000005', 500.00, 'USD');

INSERT INTO public.user_roles (user_id, role)
VALUES ('00000000-0000-0000-0000-000000000005', 'vendor');

-- ============================================
-- FEATURE TOGGLES
-- ============================================
INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled) VALUES
  ('pay_bills', 'Pay Bills', true),
  ('top_up', 'Top-Up / Airtime', true),
  ('pay_merchant', 'Pay Merchant', true),
  ('coin_convert', 'Coin Conversion', true),
  ('biometric_login', 'Biometric Login', true),
  ('qr_payments', 'QR Code Payments', true),
  ('fund_requests', 'Fund Requests', true),
  ('fund_reversals', 'Fund Reversals', true),
  ('bank_transfer', 'Bank Transfer Deposits', true),
  ('card_deposits', 'Card Deposits', true);

-- ============================================
-- TRANSACTION FEES
-- ============================================
INSERT INTO public.transaction_fees (transaction_type, fee_percentage, fixed_fee) VALUES
  ('transfer', 1.5, 0.00),
  ('deposit', 0.0, 0.00),
  ('withdrawal', 2.0, 0.50),
  ('payment', 1.0, 0.00),
  ('bill_payment', 1.0, 0.25);

-- ============================================
-- SAMPLE VENDOR PRODUCTS
-- ============================================
INSERT INTO public.vendor_products (vendor_id, name, description, category, price, discount_price) VALUES
  ('00000000-0000-0000-0000-000000000005', 'Phone Credit $5', 'Mobile phone top-up credit', 'Telecom', 5.00, NULL),
  ('00000000-0000-0000-0000-000000000005', 'Phone Credit $10', 'Mobile phone top-up credit', 'Telecom', 10.00, 9.50),
  ('00000000-0000-0000-0000-000000000005', 'Internet 1GB', '1GB mobile data package', 'Internet', 8.00, NULL),
  ('00000000-0000-0000-0000-000000000005', 'Internet 5GB', '5GB mobile data package', 'Internet', 25.00, 22.00);

-- ============================================
-- VENDOR REGISTRATION FEE
-- ============================================
INSERT INTO public.vendor_registration_fees (fee_name, fee_amount, is_active)
VALUES ('Vendor Registration Fee', 50.00, true);

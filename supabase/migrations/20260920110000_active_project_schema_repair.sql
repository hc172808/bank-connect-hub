-- Additive repair for an active Supabase project that already contains users
-- but is missing the app's ledger/KYC support schema. Existing rows are kept.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS wallet_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS pin_hash text,
  ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid;

CREATE TABLE IF NOT EXISTS public.transaction_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL UNIQUE,
  fee_percentage numeric NOT NULL DEFAULT 0 CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
  fixed_fee numeric NOT NULL DEFAULT 0 CHECK (fixed_fee >= 0),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.transaction_fees (transaction_type, fee_percentage, fixed_fee)
VALUES ('transfer', 1.0, 0.50), ('deposit', 0, 0), ('withdrawal', 0.5, 1.00)
ON CONFLICT (transaction_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  address text NOT NULL,
  country text NOT NULL,
  document_type text NOT NULL,
  document_number text NOT NULL,
  document_front_url text,
  document_back_url text,
  proof_of_address_url text,
  selfie_url text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS proof_of_address_url text;

GRANT SELECT, INSERT, UPDATE ON public.transaction_fees TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.kyc_submissions TO authenticated;
ALTER TABLE public.transaction_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
BEGIN
  _role := CASE
    WHEN NEW.raw_user_meta_data->>'account_type' IN ('vendor', 'agent', 'admin', 'founder')
      THEN NEW.raw_user_meta_data->>'account_type'
    ELSE 'client'
  END;

  INSERT INTO public.profiles (id, full_name, phone_number, wallet_address, wallet_created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NEW.raw_user_meta_data->>'wallet_address',
    CASE WHEN NEW.raw_user_meta_data->>'wallet_address' IS NOT NULL THEN now() ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallets_updated_at ON public.wallets;
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.process_transaction(
  _sender_id uuid,
  _receiver_id uuid,
  _amount numeric,
  _transaction_type text,
  _description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender_balance numeric;
  _fee_percentage numeric := 0;
  _fixed_fee numeric := 0;
  _total_fee numeric;
  _total_amount numeric;
  _transaction_id uuid;
BEGIN
  IF auth.uid() IS NULL OR _sender_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized.');
  END IF;
  IF _receiver_id IS NULL OR _receiver_id = _sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose another user.');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid amount.');
  END IF;

  SELECT balance
  INTO _sender_balance
  FROM public.wallets
  WHERE user_id = _sender_id
  FOR UPDATE;

  SELECT fee_percentage, fixed_fee
  INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees
  WHERE transaction_type = _transaction_type;

  _total_fee := (_amount * COALESCE(_fee_percentage, 0) / 100) + COALESCE(_fixed_fee, 0);
  _total_amount := _amount + _total_fee;

  IF COALESCE(_sender_balance, 0) < _total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  UPDATE public.wallets
  SET balance = balance - _total_amount, updated_at = now()
  WHERE user_id = _sender_id;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_receiver_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance, updated_at = now();

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (_sender_id, _receiver_id, _amount, _total_fee, 'completed', _transaction_type, _description, now())
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'fee', _total_fee,
    'sender_cashback', _total_fee * 0.60,
    'liquidity_pool_fee', _total_fee * 0.40
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_transaction(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_add_funds(_user_id uuid, _amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Enter a valid amount.');
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance, updated_at = now();

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin deposit', now());

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_funds(uuid, numeric) TO authenticated;

DROP POLICY IF EXISTS "Users view their own KYC" ON public.kyc_submissions;
CREATE POLICY "Users view their own KYC"
  ON public.kyc_submissions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  );

DROP POLICY IF EXISTS "Users create their own KYC" ON public.kyc_submissions;
CREATE POLICY "Users create their own KYC"
  ON public.kyc_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff update any KYC" ON public.kyc_submissions;
CREATE POLICY "Staff update any KYC"
  ON public.kyc_submissions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  );

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
CREATE POLICY "Staff can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload their own KYC docs" ON storage.objects;
CREATE POLICY "Users upload their own KYC docs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users view their own KYC docs" ON storage.objects;
CREATE POLICY "Users view their own KYC docs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'agent')
    )
  );

DROP POLICY IF EXISTS "Staff manage KYC docs" ON storage.objects;
CREATE POLICY "Staff manage KYC docs"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'kyc-documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'agent')
    )
  )
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'agent')
    )
  );
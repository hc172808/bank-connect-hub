-- Keep admin management pages usable on projects where the earlier
-- migrations were applied without their seed rows or staff read policies.

CREATE TABLE IF NOT EXISTS public.feature_toggles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key text NOT NULL UNIQUE,
  feature_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS wallet_address text,
  ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid,
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'unverified';

DROP POLICY IF EXISTS "Everyone can view feature toggles" ON public.feature_toggles;
CREATE POLICY "Everyone can view feature toggles"
  ON public.feature_toggles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage feature toggles" ON public.feature_toggles;
DROP POLICY IF EXISTS "Admins and founders can manage feature toggles" ON public.feature_toggles;
CREATE POLICY "Admins and founders can manage feature toggles"
  ON public.feature_toggles FOR ALL
  USING (
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

INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled)
VALUES
  ('pay_bills', 'Pay Bills', false),
  ('top_up', 'Mobile Top-up', false),
  ('pay_merchant', 'Pay Merchant', false),
  ('pwa_install', 'Install App Prompt', false),
  ('internal_funds', 'Internal Funds (master switch)', false)
ON CONFLICT (feature_key) DO NOTHING;

DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
CREATE POLICY "Staff can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );

DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles"
  ON public.user_roles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'agent'::public.app_role)
  );
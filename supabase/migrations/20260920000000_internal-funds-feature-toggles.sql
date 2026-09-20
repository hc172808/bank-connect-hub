-- Seed all user-facing controls used by the Feature Toggles admin page.
-- Keep this migration idempotent so it is safe on projects with partial
-- feature-toggle data from earlier migrations.

ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view feature toggles" ON public.feature_toggles;
CREATE POLICY "Everyone can view feature toggles"
  ON public.feature_toggles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage feature toggles" ON public.feature_toggles;
DROP POLICY IF EXISTS "Admins and founders can manage feature toggles" ON public.feature_toggles;
CREATE POLICY "Admins and founders can manage feature toggles"
  ON public.feature_toggles FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text IN ('admin', 'founder')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid() AND role::text IN ('admin', 'founder')
    )
  );

INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled)
VALUES
  ('pay_bills', 'Pay Bills', false),
  ('top_up', 'Mobile Top-up', false),
  ('pay_merchant', 'Pay Merchant', false),
  ('pwa_install', 'Install App Prompt', false),
  ('app_download', 'App Download', false),
  ('internal_funds', 'Internal Funds (master switch)', false),
  ('fund_requests', 'Fund Requests', false),
  ('fund_reversals', 'Fund Reversals', false),
  ('bank_transfer', 'Bank Transfer Deposits', false),
  ('card_deposits', 'Card Deposits', false),
  ('agent_deposits', 'Agent Deposits', false),
  ('agent_distributions', 'Agent Distributions', false),
  ('bank_reserve', 'Bank Reserve Controls', false)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name;
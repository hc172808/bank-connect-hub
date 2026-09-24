-- Allow admins and founders to control each Financial Tools tab for
-- non-admin users. Existing enabled states are preserved.

INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled)
VALUES
  ('financial_tools_expenses', 'Financial Tools · Expense Tracking', false),
  ('financial_tools_income', 'Financial Tools · Income Tracking', false),
  ('financial_tools_debt', 'Financial Tools · Debt Tracking', false),
  ('financial_tools_networth', 'Financial Tools · Net Worth', false)
ON CONFLICT (feature_key) DO UPDATE
SET feature_name = EXCLUDED.feature_name;
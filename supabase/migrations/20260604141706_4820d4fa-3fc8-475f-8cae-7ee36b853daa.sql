
-- 1) blockchain_settings: remove public SELECT, require auth
DROP POLICY IF EXISTS "Everyone can view blockchain settings" ON public.blockchain_settings;
CREATE POLICY "Authenticated users can view blockchain settings"
ON public.blockchain_settings FOR SELECT
TO authenticated
USING (true);

-- 2) transactions: explicit deny UPDATE/DELETE
CREATE POLICY "Transactions cannot be updated"
ON public.transactions FOR UPDATE
USING (false) WITH CHECK (false);

CREATE POLICY "Transactions cannot be deleted"
ON public.transactions FOR DELETE
USING (false);

-- 3) profiles: drop broad vendor-profile public SELECT and expose a safe view
DROP POLICY IF EXISTS "Everyone can view vendor store names" ON public.profiles;

CREATE OR REPLACE VIEW public.public_vendors
WITH (security_invoker = off) AS
SELECT p.id, p.full_name, p.store_name, p.avatar_url, p.wallet_address
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'vendor'::app_role
);

GRANT SELECT ON public.public_vendors TO anon, authenticated;

-- 4) vendor_registration_fees: require auth to view
DROP POLICY IF EXISTS "Everyone can view vendor registration fees" ON public.vendor_registration_fees;
CREATE POLICY "Authenticated users can view vendor registration fees"
ON public.vendor_registration_fees FOR SELECT
TO authenticated
USING (true);

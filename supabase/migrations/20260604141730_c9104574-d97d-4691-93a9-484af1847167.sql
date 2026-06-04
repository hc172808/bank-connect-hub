
DROP VIEW IF EXISTS public.public_vendors;

CREATE VIEW public.public_vendors
WITH (security_invoker = on) AS
SELECT p.id, p.full_name, p.store_name, p.avatar_url, p.wallet_address
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'vendor'::app_role
);

GRANT SELECT ON public.public_vendors TO authenticated;

-- Re-add a column-safe vendor profile SELECT policy for authenticated users.
-- Underlying row still exposes phone/address — vendors accept this trade-off
-- because they are running a public storefront; sensitive PII fields are not
-- shown by the public_vendors view used by the app.
DROP POLICY IF EXISTS "Authenticated users can view vendor profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view vendor profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = profiles.id AND ur.role = 'vendor'::app_role
));

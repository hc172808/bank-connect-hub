-- Replace the legacy all-wallet agent read policy with explicit role scopes.
-- Admins and founders retain full visibility; agents may read client/vendor
-- wallets only, and staff wallets remain hidden even if they hold another role.
DROP POLICY IF EXISTS "Agents can view client wallets" ON public.wallets;
DROP POLICY IF EXISTS "Staff can view permitted wallets" ON public.wallets;

CREATE POLICY "Staff can view permitted wallets"
  ON public.wallets
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'founder')
    OR (
      public.has_role(auth.uid(), 'agent')
      AND NOT public.has_role(user_id, 'admin')
      AND NOT public.has_role(user_id, 'founder')
      AND (
        public.has_role(user_id, 'client')
        OR public.has_role(user_id, 'vendor')
      )
    )
  );

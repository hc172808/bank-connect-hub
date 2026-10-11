-- Ensure each signed-in user can read only their own internal ledger balance.
-- Staff access remains governed by the separate staff-scoped wallet policies.
DROP POLICY IF EXISTS "Users can view their own wallet" ON public.wallets;

CREATE POLICY "Users can view their own wallet"
  ON public.wallets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

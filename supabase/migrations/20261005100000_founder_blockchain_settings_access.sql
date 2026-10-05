-- Some configured Supabase projects do not have the original, older
-- blockchain_settings migration. Create the complete current schema safely.
CREATE TABLE IF NOT EXISTS public.blockchain_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_url text,
  chain_id text,
  native_coin_symbol text NOT NULL DEFAULT 'GYD',
  native_coin_name text NOT NULL DEFAULT 'GYD Coin',
  explorer_url text,
  is_active boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  liquidity_pool_address text,
  fee_wallet_address text,
  fee_wallet_encrypted_key text,
  gas_fee_gyd numeric NOT NULL DEFAULT 0.01,
  rpc_urls jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.blockchain_settings
  ADD COLUMN IF NOT EXISTS rpc_url text,
  ADD COLUMN IF NOT EXISTS chain_id text,
  ADD COLUMN IF NOT EXISTS native_coin_symbol text NOT NULL DEFAULT 'GYD',
  ADD COLUMN IF NOT EXISTS native_coin_name text NOT NULL DEFAULT 'GYD Coin',
  ADD COLUMN IF NOT EXISTS explorer_url text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS liquidity_pool_address text,
  ADD COLUMN IF NOT EXISTS fee_wallet_address text,
  ADD COLUMN IF NOT EXISTS fee_wallet_encrypted_key text,
  ADD COLUMN IF NOT EXISTS gas_fee_gyd numeric NOT NULL DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS rpc_urls jsonb DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.set_blockchain_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_blockchain_settings_updated_at
  ON public.blockchain_settings;
CREATE TRIGGER set_blockchain_settings_updated_at
  BEFORE UPDATE ON public.blockchain_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_blockchain_settings_updated_at();

INSERT INTO public.blockchain_settings (native_coin_symbol, native_coin_name, is_active)
SELECT 'GYD', 'GYD Coin', false
WHERE NOT EXISTS (SELECT 1 FROM public.blockchain_settings);

-- Only staff can query the full row, which contains the bank signing key.
ALTER TABLE public.blockchain_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view blockchain settings"
  ON public.blockchain_settings;
DROP POLICY IF EXISTS "Admins can manage blockchain settings"
  ON public.blockchain_settings;
DROP POLICY IF EXISTS "Admins and founders can view blockchain settings"
  ON public.blockchain_settings;
DROP POLICY IF EXISTS "Admins and founders can manage blockchain settings"
  ON public.blockchain_settings;

CREATE POLICY "Admins and founders can manage blockchain settings"
  ON public.blockchain_settings
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'founder')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'founder')
  );

REVOKE ALL ON TABLE public.blockchain_settings
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.blockchain_settings TO authenticated;
GRANT ALL ON public.blockchain_settings TO service_role;

-- Browser clients receive only chain configuration and public addresses.
-- Never add fee_wallet_encrypted_key (the bank's signing key) to this view.
CREATE OR REPLACE VIEW public.blockchain_settings_public AS
SELECT
  rpc_url,
  chain_id,
  native_coin_symbol,
  native_coin_name,
  explorer_url,
  is_active,
  liquidity_pool_address,
  fee_wallet_address,
  gas_fee_gyd,
  rpc_urls,
  created_at,
  updated_at
FROM public.blockchain_settings;

REVOKE ALL ON TABLE public.blockchain_settings_public
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.blockchain_settings_public TO anon, authenticated;

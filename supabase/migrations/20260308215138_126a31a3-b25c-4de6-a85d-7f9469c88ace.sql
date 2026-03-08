
-- Table to store biometric (WebAuthn) credentials for passwordless login
CREATE TABLE public.biometric_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  device_name text DEFAULT 'Unknown Device',
  auth_type text NOT NULL DEFAULT 'fingerprint',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone
);

ALTER TABLE public.biometric_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own biometric credentials"
  ON public.biometric_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own biometric credentials"
  ON public.biometric_credentials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own biometric credentials"
  ON public.biometric_credentials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own biometric credentials"
  ON public.biometric_credentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add rpc_urls column (JSON array) to blockchain_settings for multi-RPC fallback
ALTER TABLE public.blockchain_settings ADD COLUMN IF NOT EXISTS rpc_urls jsonb DEFAULT '[]'::jsonb;

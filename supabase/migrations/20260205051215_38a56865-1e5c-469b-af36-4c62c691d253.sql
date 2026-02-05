-- Add PIN column to profiles for transaction verification
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Create index for faster phone number lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_profiles_phone_number ON public.profiles(phone_number);

-- Create a table to track gas fees collected and spent by the bank
CREATE TABLE IF NOT EXISTS public.gas_fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL, -- 'collected' or 'spent'
  amount NUMERIC NOT NULL,
  related_transaction_id UUID,
  user_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on gas_fee_ledger
ALTER TABLE public.gas_fee_ledger ENABLE ROW LEVEL SECURITY;

-- Only admins can view and manage gas fee ledger
CREATE POLICY "Admins can manage gas fee ledger"
  ON public.gas_fee_ledger
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create function to hash PIN (simple hash for demo, use bcrypt in production)
CREATE OR REPLACE FUNCTION public.hash_pin(pin TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN encode(digest(pin, 'sha256'), 'hex');
END;
$$;

-- Create function to verify PIN
CREATE OR REPLACE FUNCTION public.verify_pin(user_id UUID, pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT pin_hash INTO stored_hash FROM profiles WHERE id = user_id;
  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN stored_hash = encode(digest(pin, 'sha256'), 'hex');
END;
$$;

-- Create function to set PIN
CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET pin_hash = encode(digest(user_pin, 'sha256'), 'hex')
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;
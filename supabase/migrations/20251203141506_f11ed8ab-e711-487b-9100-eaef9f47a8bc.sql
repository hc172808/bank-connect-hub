-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add wallet fields to profiles
ALTER TABLE public.profiles
ADD COLUMN wallet_address text,
ADD COLUMN wallet_created_at timestamp with time zone;

-- Create user_wallets table for blockchain wallet info
CREATE TABLE public.user_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  wallet_address text NOT NULL,
  encrypted_private_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on user_wallets
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- Users can only view their own wallet
CREATE POLICY "Users can view their own wallet"
ON public.user_wallets
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own wallet
CREATE POLICY "Users can insert their own wallet"
ON public.user_wallets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all wallets
CREATE POLICY "Admins can view all wallets"
ON public.user_wallets
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
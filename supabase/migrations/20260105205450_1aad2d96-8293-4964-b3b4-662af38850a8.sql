-- Add fee wallet address column to blockchain_settings
ALTER TABLE public.blockchain_settings 
ADD COLUMN fee_wallet_address text;
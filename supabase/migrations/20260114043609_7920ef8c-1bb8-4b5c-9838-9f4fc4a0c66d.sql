-- Add encrypted fee wallet private key for bank-sponsored gas payments
ALTER TABLE public.blockchain_settings 
ADD COLUMN IF NOT EXISTS fee_wallet_encrypted_key text;

-- Add gas fee percentage in GYD that users pay (transparent fee shown to users)
ALTER TABLE public.blockchain_settings 
ADD COLUMN IF NOT EXISTS gas_fee_gyd numeric NOT NULL DEFAULT 0.01;

-- Add column description
COMMENT ON COLUMN public.blockchain_settings.fee_wallet_encrypted_key IS 'Encrypted private key for the bank fee wallet that sponsors gas fees';
COMMENT ON COLUMN public.blockchain_settings.gas_fee_gyd IS 'Fee in GYD charged to users for gas sponsorship (transparent to user)';
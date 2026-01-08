-- Add vendor role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';

-- Create vendor_products table for vendors to add items
CREATE TABLE public.vendor_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  price NUMERIC NOT NULL,
  discount_price NUMERIC,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;

-- Policies for vendor_products
CREATE POLICY "Vendors can manage their own products"
ON public.vendor_products
FOR ALL
USING (auth.uid() = vendor_id);

CREATE POLICY "Everyone can view active products"
ON public.vendor_products
FOR SELECT
USING (is_active = true);

-- Create trigger for updated_at
CREATE TRIGGER update_vendor_products_updated_at
BEFORE UPDATE ON public.vendor_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update process_transaction to handle admin unlimited funds
CREATE OR REPLACE FUNCTION public.process_transaction(_sender_id uuid, _receiver_id uuid, _amount numeric, _transaction_type text, _description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sender_balance numeric;
  _fee_percentage numeric;
  _fixed_fee numeric;
  _total_fee numeric;
  _total_amount numeric;
  _transaction_id uuid;
  _sender_cashback numeric;
  _liquidity_pool_fee numeric;
  _is_admin boolean;
BEGIN
  -- Check if sender is admin (admins have unlimited funds)
  SELECT public.has_role(_sender_id, 'admin') INTO _is_admin;

  -- Lock sender's wallet to prevent concurrent modifications (double-spending prevention)
  SELECT balance INTO _sender_balance
  FROM public.wallets
  WHERE user_id = _sender_id
  FOR UPDATE;

  -- Get fee structure
  SELECT fee_percentage, fixed_fee INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees
  WHERE transaction_type = _transaction_type;

  -- Calculate fees (no fees for admin)
  IF _is_admin THEN
    _total_fee := 0;
    _sender_cashback := 0;
    _liquidity_pool_fee := 0;
    _total_amount := _amount;
  ELSE
    _total_fee := (_amount * COALESCE(_fee_percentage, 0) / 100) + COALESCE(_fixed_fee, 0);
    
    -- Fee split: 60% cashback to sender, 40% to liquidity pool
    _sender_cashback := _total_fee * 0.60;
    _liquidity_pool_fee := _total_fee * 0.40;
    
    -- Total amount sender pays (amount + liquidity pool portion only, since they get 60% back)
    _total_amount := _amount + _liquidity_pool_fee;
  END IF;

  -- Check if sender has sufficient balance (skip for admin - unlimited funds)
  IF NOT _is_admin AND _sender_balance < _total_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance'
    );
  END IF;

  -- Deduct from sender (only if not admin or if admin has wallet entry)
  IF NOT _is_admin THEN
    UPDATE public.wallets
    SET balance = balance - _total_amount,
        updated_at = now()
    WHERE user_id = _sender_id;
  END IF;

  -- Add to receiver (create wallet if doesn't exist)
  INSERT INTO public.wallets (user_id, balance)
  VALUES (_receiver_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = wallets.balance + _amount,
      updated_at = now();

  -- Create transaction record
  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (_sender_id, _receiver_id, _amount, _total_fee, 'completed', _transaction_type, _description, now())
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'fee', _total_fee,
    'sender_cashback', _sender_cashback,
    'liquidity_pool_fee', _liquidity_pool_fee
  );
END;
$function$;
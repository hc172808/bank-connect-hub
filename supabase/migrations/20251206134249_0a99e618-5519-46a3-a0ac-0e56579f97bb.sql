-- Add liquidity pool address to blockchain settings
ALTER TABLE public.blockchain_settings 
ADD COLUMN IF NOT EXISTS liquidity_pool_address text;

-- Update process_transaction to include fee split (60% cashback, 40% liquidity)
CREATE OR REPLACE FUNCTION public.process_transaction(_sender_id uuid, _receiver_id uuid, _amount numeric, _transaction_type text, _description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _sender_balance numeric;
  _fee_percentage numeric;
  _fixed_fee numeric;
  _total_fee numeric;
  _total_amount numeric;
  _transaction_id uuid;
  _sender_cashback numeric;
  _liquidity_pool_fee numeric;
BEGIN
  -- Lock sender's wallet to prevent concurrent modifications (double-spending prevention)
  SELECT balance INTO _sender_balance
  FROM public.wallets
  WHERE user_id = _sender_id
  FOR UPDATE;

  -- Get fee structure
  SELECT fee_percentage, fixed_fee INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees
  WHERE transaction_type = _transaction_type;

  -- Calculate fees
  _total_fee := (_amount * _fee_percentage / 100) + COALESCE(_fixed_fee, 0);
  
  -- Fee split: 60% cashback to sender, 40% to liquidity pool
  _sender_cashback := _total_fee * 0.60;
  _liquidity_pool_fee := _total_fee * 0.40;
  
  -- Total amount sender pays (amount + liquidity pool portion only, since they get 60% back)
  _total_amount := _amount + _liquidity_pool_fee;

  -- Check if sender has sufficient balance
  IF _sender_balance < _total_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance'
    );
  END IF;

  -- Deduct from sender (amount + liquidity pool fee portion)
  UPDATE public.wallets
  SET balance = balance - _total_amount,
      updated_at = now()
  WHERE user_id = _sender_id;

  -- Add to receiver
  UPDATE public.wallets
  SET balance = balance + _amount,
      updated_at = now()
  WHERE user_id = _receiver_id;

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
$$;
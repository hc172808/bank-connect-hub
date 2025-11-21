-- Create transactions table with double-spending prevention
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES auth.users(id) NOT NULL,
  receiver_id uuid REFERENCES auth.users(id) NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  transaction_type text NOT NULL CHECK (transaction_type IN ('transfer', 'deposit', 'withdrawal', 'fund_request')),
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT no_self_transfer CHECK (sender_id != receiver_id)
);

-- Create transaction_fees table for admin to manage fees
CREATE TABLE public.transaction_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text NOT NULL UNIQUE,
  fee_percentage numeric NOT NULL DEFAULT 0 CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
  fixed_fee numeric NOT NULL DEFAULT 0 CHECK (fixed_fee >= 0),
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Insert default fees
INSERT INTO public.transaction_fees (transaction_type, fee_percentage, fixed_fee) VALUES
('transfer', 1.0, 0.50),
('deposit', 0, 0),
('withdrawal', 0.5, 1.00);

-- Create fund_requests table with verification codes
CREATE TABLE public.fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES auth.users(id) NOT NULL,
  payer_id uuid REFERENCES auth.users(id) NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  verification_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

-- Create pending_deposits table for agent deposits awaiting admin approval
CREATE TABLE public.pending_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES auth.users(id) NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  processed_at timestamp with time zone
);

-- Add indexes for performance
CREATE INDEX idx_transactions_sender ON public.transactions(sender_id);
CREATE INDEX idx_transactions_receiver ON public.transactions(receiver_id);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_fund_requests_payer ON public.fund_requests(payer_id);
CREATE INDEX idx_fund_requests_requester ON public.fund_requests(requester_id);
CREATE INDEX idx_pending_deposits_status ON public.pending_deposits(status);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_deposits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transactions
CREATE POLICY "Users can view their own transactions"
ON public.transactions FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Admins can view all transactions"
ON public.transactions FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create transactions"
ON public.transactions FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- RLS Policies for transaction_fees
CREATE POLICY "Everyone can view fees"
ON public.transaction_fees FOR SELECT
USING (true);

CREATE POLICY "Admins can manage fees"
ON public.transaction_fees FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for fund_requests
CREATE POLICY "Users can view their fund requests"
ON public.fund_requests FOR SELECT
USING (auth.uid() = requester_id OR auth.uid() = payer_id);

CREATE POLICY "Users can create fund requests"
ON public.fund_requests FOR INSERT
WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Payers can update fund request status"
ON public.fund_requests FOR UPDATE
USING (auth.uid() = payer_id);

-- RLS Policies for pending_deposits
CREATE POLICY "Agents can view their pending deposits"
ON public.pending_deposits FOR SELECT
USING (auth.uid() = agent_id OR public.has_role(auth.uid(), 'agent'));

CREATE POLICY "Admins can view all pending deposits"
ON public.pending_deposits FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents can create deposits"
ON public.pending_deposits FOR INSERT
WITH CHECK (auth.uid() = agent_id AND public.has_role(auth.uid(), 'agent'));

CREATE POLICY "Admins can approve deposits"
ON public.pending_deposits FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Function to process transaction with double-spending prevention
CREATE OR REPLACE FUNCTION public.process_transaction(
  _sender_id uuid,
  _receiver_id uuid,
  _amount numeric,
  _transaction_type text,
  _description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sender_balance numeric;
  _fee_percentage numeric;
  _fixed_fee numeric;
  _total_fee numeric;
  _total_amount numeric;
  _transaction_id uuid;
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
  _total_amount := _amount + _total_fee;

  -- Check if sender has sufficient balance
  IF _sender_balance < _total_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient balance'
    );
  END IF;

  -- Deduct from sender
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
    'fee', _total_fee
  );
END;
$$;

-- Function for admin to add funds
CREATE OR REPLACE FUNCTION public.admin_add_funds(
  _user_id uuid,
  _amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Add funds to user wallet
  UPDATE public.wallets
  SET balance = balance + _amount,
      updated_at = now()
  WHERE user_id = _user_id;

  -- Create transaction record
  INSERT INTO public.transactions (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin deposit', now());

  RETURN jsonb_build_object('success', true);
END;
$$;
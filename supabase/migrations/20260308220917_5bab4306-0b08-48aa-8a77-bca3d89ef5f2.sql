
-- Fund reversals table
CREATE TABLE public.fund_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  funds_held_at timestamptz,
  funds_returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fund_reversals ENABLE ROW LEVEL SECURITY;

-- Users can create reversal requests for their own transactions
CREATE POLICY "Users can create reversal requests"
  ON public.fund_reversals FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Users can view their own reversal requests
CREATE POLICY "Users can view their own reversals"
  ON public.fund_reversals FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- Admins can view all reversals
CREATE POLICY "Admins can view all reversals"
  ON public.fund_reversals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can update reversals (approve/reject)
CREATE POLICY "Admins can update reversals"
  ON public.fund_reversals FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Agents can view all reversals
CREATE POLICY "Agents can view all reversals"
  ON public.fund_reversals FOR SELECT
  USING (public.has_role(auth.uid(), 'agent'));

-- Agents can update reversals
CREATE POLICY "Agents can update reversals"
  ON public.fund_reversals FOR UPDATE
  USING (public.has_role(auth.uid(), 'agent'));

-- Function to approve a reversal: deducts from wrong recipient immediately, schedules return in 1 hour
CREATE OR REPLACE FUNCTION public.approve_fund_reversal(_reversal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reversal record;
  _recipient_balance numeric;
BEGIN
  -- Check caller is admin or agent
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Get reversal details
  SELECT * INTO _reversal FROM public.fund_reversals WHERE id = _reversal_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal not found or already processed');
  END IF;

  -- Lock recipient wallet
  SELECT balance INTO _recipient_balance FROM public.wallets WHERE user_id = _reversal.recipient_id FOR UPDATE;

  IF _recipient_balance < _reversal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient has insufficient balance for reversal');
  END IF;

  -- Deduct from wrong recipient immediately
  UPDATE public.wallets SET balance = balance - _reversal.amount, updated_at = now() WHERE user_id = _reversal.recipient_id;

  -- Update reversal status to approved with hold time
  UPDATE public.fund_reversals
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      funds_held_at = now()
  WHERE id = _reversal_id;

  -- Notify recipient that funds were reversed
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_reversal.recipient_id, 'Fund Reversal', 'A reversal of $' || _reversal.amount || ' has been processed from your account.', 'warning');

  -- Notify requester that reversal was approved (funds return in 1 hour)
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_reversal.requester_id, 'Reversal Approved', 'Your reversal request for $' || _reversal.amount || ' was approved. Funds will return to your account within 1 hour.', 'success');

  RETURN jsonb_build_object('success', true, 'message', 'Funds deducted from recipient. Will be returned to sender in 1 hour.');
END;
$$;

-- Function to process pending returns (called by cron/edge function)
CREATE OR REPLACE FUNCTION public.process_pending_reversals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reversal record;
  _processed int := 0;
BEGIN
  FOR _reversal IN
    SELECT * FROM public.fund_reversals
    WHERE status = 'approved'
    AND funds_held_at IS NOT NULL
    AND funds_held_at + interval '1 hour' <= now()
  LOOP
    -- Return funds to original sender
    UPDATE public.wallets SET balance = balance + _reversal.amount, updated_at = now() WHERE user_id = _reversal.requester_id;

    -- Mark reversal as completed
    UPDATE public.fund_reversals SET status = 'completed', funds_returned_at = now() WHERE id = _reversal.id;

    -- Notify sender
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (_reversal.requester_id, 'Funds Returned', '$' || _reversal.amount || ' has been returned to your account.', 'success');

    _processed := _processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', _processed);
END;
$$;

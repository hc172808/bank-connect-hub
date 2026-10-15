-- Make reversal requests and approvals server-authoritative and atomic.
-- Approval holds the recipient's funds; a separate scheduled worker returns
-- them after one hour and posts an auditable ledger transaction.

ALTER TABLE public.fund_reversals
  ADD COLUMN IF NOT EXISTS reversal_transaction_id uuid
  REFERENCES public.transactions(id);

CREATE INDEX IF NOT EXISTS fund_reversals_due_processing_idx
  ON public.fund_reversals (funds_held_at, id)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS fund_reversals_transaction_status_idx
  ON public.fund_reversals (transaction_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS fund_reversals_return_transaction_id_uidx
  ON public.fund_reversals (reversal_transaction_id)
  WHERE reversal_transaction_id IS NOT NULL;

-- A returned reversal is a transfer in the existing ledger vocabulary; the
-- description and reversal_transaction_id provide the audit link.
CREATE OR REPLACE FUNCTION public.request_fund_reversal(
  _transaction_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _requester_id uuid := auth.uid();
  _original public.transactions%ROWTYPE;
  _reversal_id uuid;
  _reason_value text := NULLIF(btrim(_reason), '');
BEGIN
  IF _requester_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _transaction_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Choose a valid transaction');
  END IF;

  IF _reason_value IS NOT NULL AND char_length(_reason_value) > 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reason must be 500 characters or fewer');
  END IF;

  -- Serialize requests for the same original transfer, including concurrent
  -- requests from the same account.
  PERFORM pg_advisory_xact_lock(hashtextextended(_transaction_id::text, 0::bigint));

  SELECT t.* INTO _original
  FROM public.transactions AS t
  WHERE t.id = _transaction_id;

  IF NOT FOUND
     OR _original.sender_id IS DISTINCT FROM _requester_id
     OR _original.status IS DISTINCT FROM 'completed'
     OR _original.transaction_type IS DISTINCT FROM 'transfer'
     OR _original.amount <= 0
     OR _original.receiver_id = _requester_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'This transfer is not eligible for reversal');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fund_reversals AS r
    WHERE r.transaction_id = _transaction_id
      AND r.status IN ('pending', 'approved', 'completed')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A reversal request already exists for this transfer');
  END IF;

  INSERT INTO public.fund_reversals (
    transaction_id,
    requester_id,
    recipient_id,
    amount,
    reason
  )
  VALUES (
    _transaction_id,
    _requester_id,
    _original.receiver_id,
    _original.amount,
    COALESCE(_reason_value, 'Sent to wrong user')
  )
  RETURNING id INTO _reversal_id;

  RETURN jsonb_build_object('success', true, 'reversal_id', _reversal_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_fund_reversal(_reversal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _reversal public.fund_reversals%ROWTYPE;
  _original public.transactions%ROWTYPE;
  _recipient_balance numeric;
  _held_at timestamptz;
BEGIN
  IF _actor_id IS NULL
     OR NOT (
       public.has_role(_actor_id, 'admin')
       OR public.has_role(_actor_id, 'founder')
       OR public.has_role(_actor_id, 'agent')
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT r.* INTO _reversal
  FROM public.fund_reversals AS r
  WHERE r.id = _reversal_id
  FOR UPDATE;

  IF NOT FOUND OR _reversal.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal not found or already processed');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_reversal.transaction_id::text, 0::bigint));

  SELECT t.* INTO _original
  FROM public.transactions AS t
  WHERE t.id = _reversal.transaction_id;

  IF NOT FOUND
     OR _original.sender_id IS DISTINCT FROM _reversal.requester_id
     OR _original.receiver_id IS DISTINCT FROM _reversal.recipient_id
     OR _original.amount IS DISTINCT FROM _reversal.amount
     OR _original.status IS DISTINCT FROM 'completed'
     OR _original.transaction_type IS DISTINCT FROM 'transfer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Original transfer details no longer match this request');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fund_reversals AS r
    WHERE r.transaction_id = _reversal.transaction_id
      AND r.id <> _reversal.id
      AND r.status IN ('pending', 'approved', 'completed')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Another active reversal already exists for this transfer');
  END IF;

  SELECT w.balance INTO _recipient_balance
  FROM public.wallets AS w
  WHERE w.user_id = _reversal.recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient wallet was not found');
  END IF;

  IF _recipient_balance < _reversal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient has insufficient balance for reversal');
  END IF;

  UPDATE public.wallets
  SET balance = balance - _reversal.amount,
      updated_at = now()
  WHERE user_id = _reversal.recipient_id;

  _held_at := now();
  UPDATE public.fund_reversals
  SET status = 'approved',
      approved_by = _actor_id,
      approved_at = _held_at,
      funds_held_at = _held_at
  WHERE id = _reversal.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversal state changed during approval';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    _reversal.recipient_id,
    'Fund reversal hold',
    '$' || _reversal.amount || ' was placed on hold after a reversal request was approved.',
    'warning'
  );

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    _reversal.requester_id,
    'Reversal approved',
    'Your request for $' || _reversal.amount || ' was approved. The funds are scheduled to return after a one-hour hold.',
    'success'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Funds are held and scheduled for return after one hour.',
    'return_at', _held_at + interval '1 hour'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_fund_reversal(_reversal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _actor_id uuid := auth.uid();
  _reversal public.fund_reversals%ROWTYPE;
BEGIN
  IF _actor_id IS NULL
     OR NOT (
       public.has_role(_actor_id, 'admin')
       OR public.has_role(_actor_id, 'founder')
       OR public.has_role(_actor_id, 'agent')
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT r.* INTO _reversal
  FROM public.fund_reversals AS r
  WHERE r.id = _reversal_id
  FOR UPDATE;

  IF NOT FOUND OR _reversal.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal not found or already processed');
  END IF;

  UPDATE public.fund_reversals
  SET status = 'rejected',
      approved_by = _actor_id,
      approved_at = now()
  WHERE id = _reversal.id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reversal state changed during rejection';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    _reversal.requester_id,
    'Reversal request rejected',
    'Your reversal request for $' || _reversal.amount || ' was rejected. No funds were moved.',
    'info'
  );

  RETURN jsonb_build_object('success', true, 'message', 'Reversal rejected; no funds were moved.');
END;
$$;

CREATE OR REPLACE FUNCTION public.process_pending_reversals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _reversal public.fund_reversals%ROWTYPE;
  _return_transaction_id uuid;
  _wallet_user_id uuid;
  _processed integer := 0;
  _failed integer := 0;
  _blocked integer := 0;
BEGIN
  FOR _reversal IN
    SELECT r.*
    FROM public.fund_reversals AS r
    WHERE r.status = 'approved'
      AND r.funds_held_at IS NOT NULL
      AND r.funds_held_at + interval '1 hour' <= now()
      AND r.reversal_transaction_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.fund_reversals AS other
        WHERE other.transaction_id = r.transaction_id
          AND other.id <> r.id
          AND other.status IN ('pending', 'approved', 'completed')
      )
    ORDER BY r.funds_held_at, r.id
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.wallets
      SET balance = balance + _reversal.amount,
          updated_at = now()
      WHERE user_id = _reversal.requester_id
      RETURNING user_id INTO _wallet_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requester wallet was not found';
      END IF;

      INSERT INTO public.transactions (
        sender_id,
        receiver_id,
        amount,
        fee,
        status,
        transaction_type,
        description,
        completed_at
      )
      VALUES (
        _reversal.recipient_id,
        _reversal.requester_id,
        _reversal.amount,
        0,
        'completed',
        'transfer',
        'Fund reversal return: request ' || _reversal.id::text,
        now()
      )
      RETURNING id INTO _return_transaction_id;

      UPDATE public.fund_reversals
      SET status = 'completed',
          funds_returned_at = now(),
          reversal_transaction_id = _return_transaction_id
      WHERE id = _reversal.id
        AND status = 'approved'
        AND reversal_transaction_id IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reversal state changed during return';
      END IF;

      _processed := _processed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Roll back only this reversal and continue with other due requests.
      _failed := _failed + 1;
      RAISE WARNING 'Could not process fund reversal %: %', _reversal.id, SQLERRM;
    END;
  END LOOP;

  SELECT count(*)::integer INTO _blocked
  FROM public.fund_reversals AS r
  WHERE r.status = 'approved'
    AND r.funds_held_at IS NOT NULL
    AND r.funds_held_at + interval '1 hour' <= now()
    AND r.reversal_transaction_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.fund_reversals AS other
      WHERE other.transaction_id = r.transaction_id
        AND other.id <> r.id
        AND other.status IN ('pending', 'approved', 'completed')
    );

  IF _blocked > 0 THEN
    RAISE WARNING '% due reversal(s) are blocked because duplicate requests need review', _blocked;
  END IF;

  RETURN jsonb_build_object(
    'success', _failed = 0 AND _blocked = 0,
    'processed', _processed,
    'failed', _failed,
    'blocked', _blocked
  );
END;
$$;

-- Tell the transaction trigger to send a reversal-specific message, not a
-- misleading "Payment Sent" notification to the recipient.
CREATE OR REPLACE FUNCTION public.notify_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_name text;
  _receiver_name text;
BEGIN
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.transaction_type = 'transfer'
     AND COALESCE(NEW.description, '') LIKE 'Fund reversal return:%' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.receiver_id,
      'Funds returned',
      '$' || NEW.amount || ' was returned through an approved fund reversal.',
      'success'
    );
    RETURN NEW;
  END IF;

  SELECT full_name INTO _sender_name FROM public.profiles WHERE id = NEW.sender_id;
  SELECT full_name INTO _receiver_name FROM public.profiles WHERE id = NEW.receiver_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    NEW.receiver_id,
    'Payment Received',
    'You received $' || NEW.amount || ' from ' || COALESCE(_sender_name, 'someone'),
    'success'
  );

  IF NEW.transaction_type = 'transfer' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.sender_id,
      'Payment Sent',
      'You sent $' || NEW.amount || ' to ' || COALESCE(_receiver_name, 'someone'),
      'info'
    );
  ELSIF NEW.transaction_type = 'deposit' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (
      NEW.receiver_id,
      'Deposit Received',
      'Your account was credited with $' || NEW.amount,
      'success'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Requests and decisions go through the checked RPCs, never client-supplied
-- amounts, identities, wallet updates, or reversal status updates.
DROP POLICY IF EXISTS "Users can create reversal requests" ON public.fund_reversals;
DROP POLICY IF EXISTS "Admins can update reversals" ON public.fund_reversals;
DROP POLICY IF EXISTS "Agents can update reversals" ON public.fund_reversals;

REVOKE INSERT, UPDATE ON TABLE public.fund_reversals FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.request_fund_reversal(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_fund_reversal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_fund_reversal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_pending_reversals() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_fund_reversal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_fund_reversal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_fund_reversal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_pending_reversals() TO service_role;

NOTIFY pgrst, 'reload schema';

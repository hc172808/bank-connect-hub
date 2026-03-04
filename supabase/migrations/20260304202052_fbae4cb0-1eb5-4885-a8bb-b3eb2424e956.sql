
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
  -- Only notify on completed transactions
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;

  -- Get names
  SELECT full_name INTO _sender_name FROM profiles WHERE id = NEW.sender_id;
  SELECT full_name INTO _receiver_name FROM profiles WHERE id = NEW.receiver_id;

  -- Notify receiver: payment received
  INSERT INTO notifications (user_id, title, message, type)
  VALUES (
    NEW.receiver_id,
    'Payment Received',
    'You received $' || NEW.amount || ' from ' || COALESCE(_sender_name, 'someone'),
    'success'
  );

  -- Notify sender: payment sent confirmation
  IF NEW.transaction_type = 'transfer' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.sender_id,
      'Payment Sent',
      'You sent $' || NEW.amount || ' to ' || COALESCE(_receiver_name, 'someone'),
      'info'
    );
  ELSIF NEW.transaction_type = 'deposit' THEN
    INSERT INTO notifications (user_id, title, message, type)
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

CREATE TRIGGER on_transaction_completed
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_transaction();

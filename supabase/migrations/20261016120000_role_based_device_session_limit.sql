-- Regular accounts are limited to two active devices. Admins and founders
-- are exempt so staff can stay signed in on as many devices as needed.
CREATE OR REPLACE FUNCTION public.enforce_two_active_device_sessions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_count integer;
BEGIN
  IF NEW.revoked_at IS NOT NULL OR NEW.device_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.pending_until IS NOT NULL AND NEW.pending_until <= now() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = NEW.user_id
      AND ur.role::text IN ('admin', 'founder')
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text)::bigint);

  SELECT count(*) INTO _active_count
  FROM public.device_sessions AS s
  WHERE s.user_id = NEW.user_id
    AND s.device_id IS NOT NULL
    AND s.revoked_at IS NULL
    AND (s.pending_until IS NULL OR s.pending_until > now())
    AND (TG_OP <> 'UPDATE' OR s.id <> NEW.id);

  IF _active_count >= 2 THEN
    RAISE EXCEPTION 'Regular accounts can have at most two active devices.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_two_active_device_sessions() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_two_active_device_sessions
  ON public.device_sessions;
CREATE TRIGGER trg_enforce_two_active_device_sessions
  BEFORE INSERT OR UPDATE OF user_id, device_id, revoked_at, pending_until
  ON public.device_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_two_active_device_sessions();

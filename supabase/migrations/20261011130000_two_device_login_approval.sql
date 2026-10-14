-- Keep device login approvals and device-slot enforcement server-managed.
ALTER TABLE public.device_sessions
  ADD COLUMN IF NOT EXISTS device_id text,
  ADD COLUMN IF NOT EXISTS pending_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS device_sessions_one_active_row_per_device
  ON public.device_sessions (user_id, device_id)
  WHERE device_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS device_sessions_user_active_idx
  ON public.device_sessions (user_id, last_active_at DESC)
  WHERE revoked_at IS NULL AND device_id IS NOT NULL;

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

  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text)::bigint);

  SELECT count(*) INTO _active_count
  FROM public.device_sessions AS s
  WHERE s.user_id = NEW.user_id
    AND s.device_id IS NOT NULL
    AND s.revoked_at IS NULL
    AND (s.pending_until IS NULL OR s.pending_until > now())
    AND (TG_OP <> 'UPDATE' OR s.id <> NEW.id);

  IF _active_count >= 2 THEN
    RAISE EXCEPTION 'An account can have at most two active devices.'
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

CREATE TABLE IF NOT EXISTS public.device_login_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown device',
  browser text NOT NULL DEFAULT 'Unknown',
  os text NOT NULL DEFAULT 'Unknown',
  user_agent text,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled', 'completed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  decided_by_device_id text
);

CREATE INDEX IF NOT EXISTS device_login_approvals_pending_user_idx
  ON public.device_login_approvals (user_id, created_at DESC)
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS device_login_approvals_one_pending_per_user
  ON public.device_login_approvals (user_id)
  WHERE status = 'pending';

ALTER TABLE public.device_login_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_login_approvals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.device_login_approvals TO service_role;

-- Only the server can create, activate, or revoke device-session rows.
DROP POLICY IF EXISTS "Users manage their own sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users manage own sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Users view their own sessions" ON public.device_sessions;
CREATE POLICY "Users view their own sessions"
  ON public.device_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL PRIVILEGES ON public.device_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.device_sessions TO authenticated;

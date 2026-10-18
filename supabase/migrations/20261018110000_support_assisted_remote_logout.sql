-- Support can initiate a logout, but the account holder must confirm it with
-- their wallet-lock PIN using a short-lived, single-use confirmation link.
CREATE TABLE IF NOT EXISTS public.support_logout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_role text NOT NULL
    CHECK (requested_by_role IN ('admin', 'founder', 'agent')),
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired', 'locked', 'cancelled')),
  failed_attempts integer NOT NULL DEFAULT 0
    CHECK (failed_attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  revoked_session_count integer
);

CREATE UNIQUE INDEX IF NOT EXISTS support_logout_one_pending_per_user
  ON public.support_logout_requests (user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS support_logout_expiry_idx
  ON public.support_logout_requests (expires_at)
  WHERE status = 'pending';

ALTER TABLE public.support_logout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_logout_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.support_logout_requests TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_support_logout(
  _token_hash text,
  _pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request public.support_logout_requests%ROWTYPE;
  _stored_hash text;
  _failed_attempts integer;
  _recent_attempts integer;
  _revoked_count integer;
BEGIN
  IF _token_hash IS NULL OR _token_hash !~ '^[a-f0-9]{64}$'
     OR _pin IS NULL OR _pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  SELECT * INTO _request
  FROM public.support_logout_requests
  WHERE token_hash = _token_hash
  FOR UPDATE;

  IF NOT FOUND OR _request.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  IF _request.expires_at <= now() THEN
    UPDATE public.support_logout_requests
    SET status = 'expired'
    WHERE id = _request.id;
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_or_expired');
  END IF;

  SELECT pin_hash INTO _stored_hash
  FROM public.profiles
  WHERE id = _request.user_id;

  SELECT COALESCE(SUM(failed_attempts), 0)::integer INTO _recent_attempts
  FROM public.support_logout_requests
  WHERE user_id = _request.user_id
    AND created_at > now() - interval '1 hour';

  IF _recent_attempts >= 5 THEN
    UPDATE public.support_logout_requests
    SET status = 'locked'
    WHERE id = _request.id;
    RETURN jsonb_build_object('ok', false, 'code', 'locked');
  END IF;

  IF _stored_hash IS NULL
     OR _stored_hash <> encode(extensions.digest(_pin, 'sha256'), 'hex') THEN
    _failed_attempts := _request.failed_attempts + 1;
    UPDATE public.support_logout_requests
    SET failed_attempts = _failed_attempts,
        status = CASE WHEN _recent_attempts + 1 >= 5 THEN 'locked' ELSE 'pending' END
    WHERE id = _request.id;
    RETURN jsonb_build_object(
      'ok', false,
      'code', CASE WHEN _recent_attempts + 1 >= 5 THEN 'locked' ELSE 'invalid_pin' END,
      'attempts_remaining', GREATEST(0, 5 - _recent_attempts - 1)
    );
  END IF;

  UPDATE public.device_sessions
  SET revoked_at = now(), pending_until = NULL
  WHERE user_id = _request.user_id
    AND revoked_at IS NULL;
  GET DIAGNOSTICS _revoked_count = ROW_COUNT;

  UPDATE public.support_logout_requests
  SET status = 'completed',
      confirmed_at = now(),
      revoked_session_count = _revoked_count
  WHERE id = _request.id;

  RETURN jsonb_build_object(
    'ok', true,
    'revoked_count', _revoked_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_support_logout(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_support_logout(text, text) TO service_role;

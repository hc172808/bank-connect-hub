-- Existing accounts created before the wallet trigger was installed must have
-- a zero-value wallet row so the banking dashboard can load consistently.
-- Existing balances are never changed.
INSERT INTO public.wallets (user_id, balance)
SELECT u.id, 0
FROM auth.users AS u
WHERE NOT EXISTS (
  SELECT 1
  FROM public.wallets AS w
  WHERE w.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- Wallet security PINs may contain 4-10 digits. Existing 4-digit PIN hashes
-- remain valid because the hashing algorithm and stored representation do not change.
CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF user_pin IS NULL OR user_pin !~ '^[0-9]{4,10}$' THEN
    RAISE EXCEPTION 'PIN must be between 4 and 10 digits';
  END IF;

  UPDATE public.profiles
  SET pin_hash = encode(extensions.digest(user_pin, 'sha256'), 'hex')
  WHERE id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_pin(text) TO authenticated;

-- Keep staff-assisted logout confirmation compatible with the same PIN length.
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
     OR _pin IS NULL OR _pin !~ '^[0-9]{4,10}$' THEN
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

  RETURN jsonb_build_object('ok', true, 'revoked_count', _revoked_count);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_support_logout(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_support_logout(text, text) TO service_role;

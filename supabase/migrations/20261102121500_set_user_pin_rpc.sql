-- Let an authenticated user set only their own 4-digit app/transaction PIN.
CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF user_pin IS NULL OR user_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;

  UPDATE public.profiles
  SET pin_hash = encode(extensions.digest(user_pin, 'sha256'), 'hex')
  WHERE id = auth.uid();

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_pin(text) TO authenticated;

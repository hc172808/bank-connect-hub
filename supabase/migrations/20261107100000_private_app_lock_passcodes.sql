-- Keep App Lock credentials separate from transaction PINs.
CREATE TABLE IF NOT EXISTS public.user_app_lock_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  hash_scheme text NOT NULL DEFAULT 'bcrypt'
    CHECK (hash_scheme IN ('bcrypt', 'sha256_legacy')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_app_lock_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_app_lock_pins FROM PUBLIC, anon, authenticated;

-- Preserve existing App Lock behavior for users who previously unlocked with
-- their transaction PIN. Users can replace this migrated hash in Security settings.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_hash text;
INSERT INTO public.user_app_lock_pins (user_id, pin_hash, hash_scheme)
SELECT id, pin_hash, 'sha256_legacy'
FROM public.profiles
WHERE pin_hash IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_app_lock_pin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_app_lock_pins
      WHERE user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.set_app_lock_pin(user_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  actor_id uuid := auth.uid();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Sign in before setting an App Lock passcode.';
  END IF;

  IF user_pin IS NULL OR user_pin !~ '^[!-~]{4,10}$' THEN
    RAISE EXCEPTION 'Passcode must be 4–10 printable characters without spaces.';
  END IF;

  INSERT INTO public.user_app_lock_pins (user_id, pin_hash, hash_scheme, updated_at)
  VALUES (actor_id, extensions.crypt(user_pin, extensions.gen_salt('bf', 12)), 'bcrypt', now())
  ON CONFLICT (user_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        hash_scheme = 'bcrypt',
        updated_at = now();

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_app_lock_pin(user_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash text;
  stored_scheme text;
BEGIN
  IF auth.uid() IS NULL OR user_pin IS NULL OR user_pin !~ '^[!-~]{4,10}$' THEN
    RETURN false;
  END IF;

  SELECT pin_hash, hash_scheme
  INTO stored_hash, stored_scheme
  FROM public.user_app_lock_pins
  WHERE user_id = auth.uid();

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  IF stored_scheme = 'sha256_legacy' THEN
    RETURN stored_hash = encode(extensions.digest(user_pin, 'sha256'), 'hex');
  END IF;

  RETURN extensions.crypt(user_pin, stored_hash) = stored_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.has_app_lock_pin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_app_lock_pin(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_app_lock_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_lock_pin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_app_lock_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_app_lock_pin(text) TO authenticated;

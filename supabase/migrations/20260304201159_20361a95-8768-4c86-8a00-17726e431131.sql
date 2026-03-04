
CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE profiles
  SET pin_hash = encode(extensions.digest(user_pin, 'sha256'), 'hex')
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_pin(user_id uuid, pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT pin_hash INTO stored_hash FROM profiles WHERE id = user_id;
  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN stored_hash = encode(extensions.digest(pin, 'sha256'), 'hex');
END;
$function$;

CREATE OR REPLACE FUNCTION public.hash_pin(pin text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN encode(extensions.digest(pin, 'sha256'), 'hex');
END;
$function$;

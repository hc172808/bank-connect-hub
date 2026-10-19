-- Some deployed Supabase projects still have the older app_role enum. Add the
-- founder value in its own migration so later migrations can safely reference
-- it after this transaction commits. Projects that store roles as text need no
-- change.
DO $$
DECLARE
  _role_type oid := to_regtype('public.app_role');
BEGIN
  IF _role_type IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM pg_type
        WHERE oid = _role_type
          AND typtype = 'e'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM pg_enum
        WHERE enumtypid = _role_type
          AND enumlabel = 'founder'
     ) THEN
    EXECUTE 'ALTER TYPE public.app_role ADD VALUE ''founder''';
  END IF;
END
$$;

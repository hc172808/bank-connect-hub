-- Keep device approval optional, but do not cap the number of signed-in devices.
DO $$
BEGIN
  IF to_regclass('public.device_sessions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_enforce_two_active_device_sessions ON public.device_sessions';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.enforce_two_active_device_sessions();

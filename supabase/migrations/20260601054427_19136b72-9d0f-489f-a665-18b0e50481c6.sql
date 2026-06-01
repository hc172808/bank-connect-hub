ALTER TABLE public.app_releases ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.qr_card_requests ADD COLUMN IF NOT EXISTS fulfilled_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'qr_card_requests_user_id_profiles_fkey'
  ) THEN
    ALTER TABLE public.qr_card_requests
      ADD CONSTRAINT qr_card_requests_user_id_profiles_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;
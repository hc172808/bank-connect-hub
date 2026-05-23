-- ============================================================
-- Virtual Bank – Supabase Migration Script
-- Run this once in your Supabase Dashboard → SQL Editor
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ============================================================

-- ============================================================
-- 1. APP RELEASES
--    Allows admins to publish APK/IPA downloads for users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_releases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text        NOT NULL,
  platform      text        NOT NULL CHECK (platform IN ('android','ios','web')),
  file_path     text,
  file_url      text,
  file_size     bigint,
  release_notes text,
  is_latest     boolean     NOT NULL DEFAULT false,
  created_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_releases' AND policyname = 'anyone reads releases'
  ) THEN
    CREATE POLICY "anyone reads releases"
      ON public.app_releases FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_releases' AND policyname = 'admins manage releases'
  ) THEN
    CREATE POLICY "admins manage releases"
      ON public.app_releases FOR ALL
      USING      (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_releases_latest
  ON public.app_releases(platform, is_latest);


-- ============================================================
-- 2. QR CARD REQUESTS
--    Users request a printed QR card; agents/admins fulfil it
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qr_card_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','fulfilled','cancelled')),
  notes        text,
  fulfilled_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  fulfilled_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_card_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_card_requests' AND policyname = 'users view own requests'
  ) THEN
    CREATE POLICY "users view own requests"
      ON public.qr_card_requests FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_card_requests' AND policyname = 'users insert own requests'
  ) THEN
    CREATE POLICY "users insert own requests"
      ON public.qr_card_requests FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_card_requests' AND policyname = 'users cancel own requests'
  ) THEN
    CREATE POLICY "users cancel own requests"
      ON public.qr_card_requests FOR UPDATE
      USING      (auth.uid() = user_id)
      WITH CHECK (status = 'cancelled');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_card_requests' AND policyname = 'admin_agent view all requests'
  ) THEN
    CREATE POLICY "admin_agent view all requests"
      ON public.qr_card_requests FOR SELECT
      USING (
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'agent')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_card_requests' AND policyname = 'admin_agent fulfil requests'
  ) THEN
    CREATE POLICY "admin_agent fulfil requests"
      ON public.qr_card_requests FOR UPDATE
      USING (
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'agent')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qr_requests_user
  ON public.qr_card_requests(user_id);

CREATE INDEX IF NOT EXISTS idx_qr_requests_status
  ON public.qr_card_requests(status);


-- ============================================================
-- 3. FEATURE TOGGLES – new rows
-- ============================================================
INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled)
VALUES
  ('pwa_install',   'Install as App (PWA)',        true),
  ('app_download',  'Show app download to users',  true)
ON CONFLICT (feature_key) DO NOTHING;


-- ============================================================
-- 4. STORAGE – app-releases bucket policies
--    IMPORTANT: Before running this section you must first
--    create the bucket manually:
--      Supabase Dashboard → Storage → New bucket
--      Name: app-releases   ✓ Public bucket
-- ============================================================

-- Allow anyone to download files from the bucket
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'anyone downloads app files'
  ) THEN
    CREATE POLICY "anyone downloads app files"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'app-releases');
  END IF;
END $$;

-- Allow admins to upload files
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'admins upload app files'
  ) THEN
    CREATE POLICY "admins upload app files"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'app-releases' AND
        public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;

-- Allow admins to delete files
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'admins delete app files'
  ) THEN
    CREATE POLICY "admins delete app files"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'app-releases' AND
        public.has_role(auth.uid(), 'admin')
      );
  END IF;
END $$;


-- ============================================================
-- Done! Verify with:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   ORDER BY table_name;
-- ============================================================

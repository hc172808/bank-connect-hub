-- NETLIFE CASH
-- KYC database repair for pgAdmin / PostgreSQL
--
-- Run this once against the same Supabase/PostgreSQL database used by the app.
-- This script is intentionally idempotent: it can be run again safely.
--
-- It:
--   1. Ensures the KYC table and required columns exist.
--   2. Keeps profiles.kyc_status synchronized with KYC reviews.
--   3. Backfills profile status from the latest KYC submission.
--   4. Ensures the private KYC storage bucket and access policies exist.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The app reads this field after login and uses it for KYC-gated features.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'unverified';

CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  address text NOT NULL,
  country text NOT NULL,
  document_type text NOT NULL,
  document_number text NOT NULL,
  document_front_url text,
  document_back_url text,
  proof_of_address_url text,
  selfie_url text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_submissions
  ADD COLUMN IF NOT EXISTS proof_of_address_url text,
  ADD COLUMN IF NOT EXISTS document_front_url text,
  ADD COLUMN IF NOT EXISTS document_back_url text,
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT, INSERT, UPDATE ON public.kyc_submissions TO authenticated;
GRANT ALL ON public.kyc_submissions TO service_role;

-- Keep updated_at current without depending on another project migration.
CREATE OR REPLACE FUNCTION public.set_kyc_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kyc_updated_at ON public.kyc_submissions;
CREATE TRIGGER trg_kyc_updated_at
BEFORE UPDATE ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.set_kyc_updated_at();

-- A review changes the submission and the profile together. The app's
-- navigation fix will then send an approved user to the role dashboard.
CREATE OR REPLACE FUNCTION public.sync_profile_kyc_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET kyc_status = CASE
    WHEN NEW.status = 'approved' THEN 'verified'
    WHEN NEW.status = 'rejected' THEN 'rejected'
    WHEN NEW.status = 'pending' THEN 'pending'
    ELSE kyc_status
  END
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_kyc_status ON public.kyc_submissions;
CREATE TRIGGER trg_sync_profile_kyc_status
AFTER INSERT OR UPDATE OF status ON public.kyc_submissions
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_kyc_status();

-- Repair profiles that were approved before the synchronization trigger existed.
WITH latest_kyc AS (
  SELECT DISTINCT ON (user_id)
    user_id,
    status
  FROM public.kyc_submissions
  ORDER BY user_id, created_at DESC, id DESC
)
UPDATE public.profiles AS p
SET kyc_status = CASE
  WHEN latest_kyc.status = 'approved' THEN 'verified'
  WHEN latest_kyc.status = 'rejected' THEN 'rejected'
  WHEN latest_kyc.status = 'pending' THEN 'pending'
  ELSE p.kyc_status
END
FROM latest_kyc
WHERE p.id = latest_kyc.user_id;

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their own KYC" ON public.kyc_submissions;
CREATE POLICY "Users view their own KYC"
ON public.kyc_submissions
FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'agent')
);

DROP POLICY IF EXISTS "Users create their own KYC" ON public.kyc_submissions;
CREATE POLICY "Users create their own KYC"
ON public.kyc_submissions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update their own pending KYC" ON public.kyc_submissions;
CREATE POLICY "Users update their own pending KYC"
ON public.kyc_submissions
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins update any KYC" ON public.kyc_submissions;
DROP POLICY IF EXISTS "Staff update any KYC" ON public.kyc_submissions;
CREATE POLICY "Staff update any KYC"
ON public.kyc_submissions
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'agent')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'agent')
);

-- KYC files must remain private. The app uploads them under:
-- <authenticated-user-id>/<file-name>
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users upload their own KYC docs" ON storage.objects;
CREATE POLICY "Users upload their own KYC docs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users view their own KYC docs" ON storage.objects;
CREATE POLICY "Users view their own KYC docs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'kyc-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  )
);

DROP POLICY IF EXISTS "Admins manage KYC docs" ON storage.objects;
DROP POLICY IF EXISTS "Staff manage KYC docs" ON storage.objects;
CREATE POLICY "Staff manage KYC docs"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'kyc-documents'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  )
)
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  )
);

COMMIT;

-- Verification query: an approved submission should show "verified" here.
SELECT
  p.id AS user_id,
  p.kyc_status,
  k.status AS latest_kyc_status,
  k.reviewed_at
FROM public.profiles AS p
LEFT JOIN LATERAL (
  SELECT status, reviewed_at
  FROM public.kyc_submissions
  WHERE user_id = p.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
) AS k ON true
WHERE k.status IS NOT NULL
ORDER BY k.reviewed_at DESC NULLS LAST;
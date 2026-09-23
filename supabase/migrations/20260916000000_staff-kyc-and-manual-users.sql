-- KYC requires both sides of an ID, proof of address, and a selfie.
ALTER TABLE IF EXISTS public.kyc_submissions
  ADD COLUMN IF NOT EXISTS proof_of_address_url text;

-- Phone numbers are canonicalized to E.164 by the app and must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_number_unique
  ON public.profiles (phone_number)
  WHERE phone_number IS NOT NULL AND phone_number <> '';

-- Agents may review KYC submissions alongside administrators.
DROP POLICY IF EXISTS "Users view their own KYC" ON public.kyc_submissions;
CREATE POLICY "Users view their own KYC"
  ON public.kyc_submissions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  );

DROP POLICY IF EXISTS "Admins update any KYC" ON public.kyc_submissions;
DROP POLICY IF EXISTS "Staff update any KYC" ON public.kyc_submissions;
CREATE POLICY "Staff update any KYC"
  ON public.kyc_submissions FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  );

-- Agents need to view the private document files while reviewing.
DROP POLICY IF EXISTS "Users view their own KYC docs" ON storage.objects;
CREATE POLICY "Users view their own KYC docs"
  ON storage.objects FOR SELECT
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
  ON storage.objects FOR ALL
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

-- Staff can view all profiles and role rows in the staff user-management page.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;
CREATE POLICY "Staff can view all profiles"
  ON public.profiles FOR SELECT
  USING (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'agent')
  );

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles"
  ON public.user_roles FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'agent')
  );

-- Existing WhatsApp requests can be approved by agents too.
DO $$
BEGIN
  IF to_regclass('public.whatsapp_verification_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Admins can manage WhatsApp requests" ON public.whatsapp_verification_requests;
    DROP POLICY IF EXISTS "Staff can manage WhatsApp requests" ON public.whatsapp_verification_requests;
    CREATE POLICY "Staff can manage WhatsApp requests"
      ON public.whatsapp_verification_requests FOR UPDATE
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'agent')
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'agent')
      );

    DROP POLICY IF EXISTS "Admins can delete WhatsApp requests" ON public.whatsapp_verification_requests;
    DROP POLICY IF EXISTS "Staff can delete WhatsApp requests" ON public.whatsapp_verification_requests;
    CREATE POLICY "Staff can delete WhatsApp requests"
      ON public.whatsapp_verification_requests FOR DELETE
      USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'agent')
      );
  END IF;
END $$;
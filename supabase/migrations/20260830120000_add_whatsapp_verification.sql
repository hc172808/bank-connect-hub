-- WhatsApp account-verification requests and administrator instructions.
-- The WhatsApp number and instructions remain public app settings; verification
-- requests are visible only to their owner and administrators.

CREATE TABLE IF NOT EXISTS public.whatsapp_verification_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  verification_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  admin_notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_status
  ON public.whatsapp_verification_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_verification_user
  ON public.whatsapp_verification_requests(user_id, requested_at DESC);

ALTER TABLE public.whatsapp_verification_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.whatsapp_verification_requests TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.whatsapp_verification_requests TO authenticated;
GRANT ALL ON public.whatsapp_verification_requests TO service_role;

DROP POLICY IF EXISTS "Users can view their WhatsApp requests"
  ON public.whatsapp_verification_requests;
CREATE POLICY "Users can view their WhatsApp requests"
  ON public.whatsapp_verification_requests FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can create their WhatsApp requests"
  ON public.whatsapp_verification_requests;
CREATE POLICY "Users can create their WhatsApp requests"
  ON public.whatsapp_verification_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Admins can manage WhatsApp requests"
  ON public.whatsapp_verification_requests;
CREATE POLICY "Admins can manage WhatsApp requests"
  ON public.whatsapp_verification_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete WhatsApp requests"
  ON public.whatsapp_verification_requests;
CREATE POLICY "Admins can delete WhatsApp requests"
  ON public.whatsapp_verification_requests FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings (key, value)
VALUES
  ('whatsapp_verification_enabled', 'true'::jsonb),
  ('whatsapp_support_number', '""'::jsonb),
  ('whatsapp_business_name', '"NETLIFE CASH Support"'::jsonb),
  ('whatsapp_verification_instructions', '"Send the pre-filled message exactly as shown. Never share your password, PIN, or one-time code with anyone outside the official support chat."'::jsonb)
ON CONFLICT (key) DO NOTHING;
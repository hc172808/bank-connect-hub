-- Add missing columns to app_releases
ALTER TABLE public.app_releases
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS file_path TEXT;

-- QR card requests table
CREATE TABLE IF NOT EXISTS public.qr_card_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_card_requests TO authenticated;
GRANT ALL ON public.qr_card_requests TO service_role;

ALTER TABLE public.qr_card_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own qr requests"
  ON public.qr_card_requests FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create qr requests"
  ON public.qr_card_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update qr requests"
  ON public.qr_card_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
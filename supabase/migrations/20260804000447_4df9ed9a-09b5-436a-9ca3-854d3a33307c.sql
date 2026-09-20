CREATE TABLE public.boot_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  stage text NOT NULL,
  reason text,
  message text,
  stack text,
  attempts int NOT NULL DEFAULT 0,
  online boolean,
  user_agent text,
  app_url text,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb
);

GRANT INSERT ON public.boot_error_reports TO anon;
GRANT SELECT, INSERT ON public.boot_error_reports TO authenticated;
GRANT ALL ON public.boot_error_reports TO service_role;

ALTER TABLE public.boot_error_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can report a bootstrap failure"
ON public.boot_error_reports FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Admins can read bootstrap failures"
ON public.boot_error_reports FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_boot_error_reports_created_at ON public.boot_error_reports (created_at DESC);
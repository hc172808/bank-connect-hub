-- App releases table for version/update management
CREATE TABLE IF NOT EXISTS public.app_releases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'web',
  file_url TEXT NOT NULL,
  release_notes TEXT,
  is_force_update BOOLEAN NOT NULL DEFAULT false,
  is_latest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_releases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view app releases"
  ON public.app_releases FOR SELECT USING (true);

CREATE POLICY "Admins can manage app releases"
  ON public.app_releases FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- App settings key/value store
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view app settings"
  ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Admins can manage app settings"
  ON public.app_settings FOR ALL USING (public.has_role(auth.uid(), 'admin'));
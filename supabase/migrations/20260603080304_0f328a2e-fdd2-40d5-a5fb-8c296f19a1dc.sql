-- Announcements / Ads
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  link_url text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active announcements"
  ON public.announcements FOR SELECT
  USING (
    is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at >= now())
  );

CREATE POLICY "Admins view all announcements"
  ON public.announcements FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage announcements"
  ON public.announcements FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Countries
CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  dial_code text NOT NULL,
  local_number_length int NOT NULL DEFAULT 7,
  is_allowed boolean NOT NULL DEFAULT true,
  is_banned boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.countries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view countries"
  ON public.countries FOR SELECT USING (true);

CREATE POLICY "Admins manage countries"
  ON public.countries FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.countries (code, name, dial_code, local_number_length, sort_order) VALUES
  ('GY', 'Guyana', '+592', 7, 1),
  ('TT', 'Trinidad & Tobago', '+1868', 7, 2),
  ('JM', 'Jamaica', '+1876', 7, 3),
  ('SR', 'Suriname', '+597', 7, 4),
  ('BB', 'Barbados', '+1246', 7, 5),
  ('US', 'United States', '+1', 10, 6),
  ('CA', 'Canada', '+1', 10, 7),
  ('GB', 'United Kingdom', '+44', 10, 8),
  ('BR', 'Brazil', '+55', 11, 9),
  ('IN', 'India', '+91', 10, 10),
  ('NG', 'Nigeria', '+234', 10, 11);


CREATE TABLE public.changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  is_latest boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view changelog" ON public.changelog_entries FOR SELECT USING (true);
CREATE POLICY "Admins can manage changelog" ON public.changelog_entries FOR ALL USING (has_role(auth.uid(), 'admin'));


CREATE TABLE public.mobile_money_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  ussd_code text,
  logo_letter text NOT NULL DEFAULT '?',
  color text NOT NULL DEFAULT 'bg-muted-foreground',
  merchant_number text,
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mobile_money_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active providers" ON public.mobile_money_providers
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage providers" ON public.mobile_money_providers
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Seed default providers
INSERT INTO public.mobile_money_providers (name, ussd_code, logo_letter, color, merchant_number, sort_order) VALUES
  ('Digicel MoMo', '*129#', 'D', 'bg-red-500', '+592-000-0001', 1),
  ('GTT Mobile Money', '*888#', 'G', 'bg-green-600', '+592-000-0001', 2),
  ('M-Pesa', '*234#', 'M', 'bg-green-500', '+592-000-0001', 3);

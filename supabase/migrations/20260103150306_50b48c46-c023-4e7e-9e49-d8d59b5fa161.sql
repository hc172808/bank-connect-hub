-- Create feature toggles table for admin to control visibility of features
CREATE TABLE public.feature_toggles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key text NOT NULL UNIQUE,
  feature_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view feature toggles" 
ON public.feature_toggles 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can manage feature toggles" 
ON public.feature_toggles 
FOR ALL 
USING (has_role(auth.uid(), 'admin'));

-- Insert default features (disabled by default)
INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled) VALUES
('pay_bills', 'Pay Bills', false),
('top_up', 'Mobile Top-up', false),
('pay_merchant', 'Pay Merchant', false);

-- Trigger for updated_at
CREATE TRIGGER update_feature_toggles_updated_at
BEFORE UPDATE ON public.feature_toggles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
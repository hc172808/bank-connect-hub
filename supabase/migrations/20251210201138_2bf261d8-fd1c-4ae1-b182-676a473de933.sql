-- Add unique constraint on phone_number in profiles
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_number_unique UNIQUE (phone_number);

-- Create supported coins table (admin sets which coins can be sent)
CREATE TABLE public.supported_coins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_symbol TEXT NOT NULL UNIQUE,
  coin_name TEXT NOT NULL,
  contract_address TEXT,
  is_native BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supported_coins ENABLE ROW LEVEL SECURITY;

-- RLS policies for supported_coins
CREATE POLICY "Everyone can view supported coins" ON public.supported_coins FOR SELECT USING (true);
CREATE POLICY "Admins can manage supported coins" ON public.supported_coins FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Create conversion fees table
CREATE TABLE public.conversion_fees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_coin TEXT NOT NULL,
  to_coin TEXT NOT NULL,
  fee_percentage NUMERIC NOT NULL DEFAULT 1.0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(from_coin, to_coin)
);

-- Enable RLS
ALTER TABLE public.conversion_fees ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversion_fees
CREATE POLICY "Everyone can view conversion fees" ON public.conversion_fees FOR SELECT USING (true);
CREATE POLICY "Admins can manage conversion fees" ON public.conversion_fees FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_supported_coins_updated_at BEFORE UPDATE ON public.supported_coins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversion_fees_updated_at BEFORE UPDATE ON public.conversion_fees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default GYD coin as native
INSERT INTO public.supported_coins (coin_symbol, coin_name, is_native, is_active) VALUES ('GYD', 'GYD Coin', true, true);
-- Create blockchain settings table for admin configuration
CREATE TABLE public.blockchain_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rpc_url text,
  chain_id text,
  native_coin_symbol text NOT NULL DEFAULT 'GYD',
  native_coin_name text NOT NULL DEFAULT 'GYD Coin',
  explorer_url text,
  is_active boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blockchain_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can view blockchain settings
CREATE POLICY "Everyone can view blockchain settings"
ON public.blockchain_settings
FOR SELECT
USING (true);

-- Only admins can manage blockchain settings
CREATE POLICY "Admins can manage blockchain settings"
ON public.blockchain_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_blockchain_settings_updated_at
BEFORE UPDATE ON public.blockchain_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default blockchain settings
INSERT INTO public.blockchain_settings (native_coin_symbol, native_coin_name, is_active)
VALUES ('GYD', 'GYD Coin', false);

-- Add new columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN avatar_url text,
ADD COLUMN address text,
ADD COLUMN city text,
ADD COLUMN country text,
ADD COLUMN date_of_birth date,
ADD COLUMN bio text;

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true);

-- Storage policies for avatars
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
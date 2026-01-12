-- Add store_name to profiles for vendors
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name text;

-- Create vendor_registration_fees table for admin to set vendor registration fees
CREATE TABLE IF NOT EXISTS public.vendor_registration_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_amount numeric NOT NULL DEFAULT 0,
  fee_name text NOT NULL DEFAULT 'Vendor Registration Fee',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.vendor_registration_fees ENABLE ROW LEVEL SECURITY;

-- Admins can manage vendor registration fees
CREATE POLICY "Admins can manage vendor registration fees"
ON public.vendor_registration_fees
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view vendor registration fees
CREATE POLICY "Everyone can view vendor registration fees"
ON public.vendor_registration_fees
FOR SELECT
USING (true);

-- Insert default registration fee
INSERT INTO public.vendor_registration_fees (fee_name, fee_amount, is_active)
VALUES ('Vendor Registration Fee', 50.00, true)
ON CONFLICT DO NOTHING;

-- Add RLS policy for viewing vendor profiles (store names)
CREATE POLICY "Everyone can view vendor store names"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_roles.user_id = profiles.id 
    AND user_roles.role = 'vendor'
  )
);
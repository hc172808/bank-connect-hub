-- Update the handle_new_user function to assign role based on account_type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  account_type text;
  user_role app_role;
BEGIN
  -- Get account_type from raw_user_meta_data
  account_type := (NEW.raw_user_meta_data->>'account_type')::text;
  
  -- Determine role based on account_type (default to 'client')
  IF account_type = 'vendor' THEN
    user_role := 'vendor'::app_role;
  ELSE
    user_role := 'client'::app_role;
  END IF;
  
  -- Insert profile
  INSERT INTO public.profiles (id, full_name, phone_number, wallet_address, wallet_created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NEW.raw_user_meta_data->>'wallet_address',
    CASE WHEN NEW.raw_user_meta_data->>'wallet_address' IS NOT NULL THEN now() ELSE NULL END
  );
  
  -- Insert wallet with 0 balance
  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (NEW.id, 0, 'USD');
  
  -- Insert user role based on account_type
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
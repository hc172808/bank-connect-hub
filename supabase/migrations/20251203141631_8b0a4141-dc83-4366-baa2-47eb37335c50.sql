-- Update handle_new_user to include wallet_address from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name, phone_number, wallet_address, wallet_created_at)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone_number',
    new.raw_user_meta_data ->> 'wallet_address',
    CASE WHEN new.raw_user_meta_data ->> 'wallet_address' IS NOT NULL THEN now() ELSE NULL END
  );
  
  -- Insert default role (client) if no role specified
  insert into public.user_roles (user_id, role)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'client'));
  
  -- Create wallet for client users
  if coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'client') = 'client' then
    insert into public.wallets (user_id)
    values (new.id);
  end if;
  
  return new;
end;
$function$;
-- Creates the requested administrator login in Supabase Auth.
-- The application uses phone digits + @vbank.com as the login email.
-- Run this with the Supabase SQL editor using a role that can write auth.users.
-- Before running this script, set the password only in the current SQL session:
--   select set_config('app.admin_password', '<your-password>', false);
-- The password is intentionally not stored in this file.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  _user_id uuid;
  _email text := '6431651@vbank.com';
  _password text := current_setting('app.admin_password', true);
BEGIN
  IF _password IS NULL OR _password = '' THEN
    RAISE EXCEPTION 'Set app.admin_password in this SQL session before running SQL-update.sql';
  END IF;

  SELECT id INTO _user_id FROM auth.users WHERE email = _email LIMIT 1;

  IF _user_id IS NULL THEN
    _user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      _user_id, 'authenticated', 'authenticated', _email,
      crypt(_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Founder Admin","phone_number":"6431651","account_type":"admin","role":"admin"}'::jsonb,
      now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt(_password, gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
          || '{"full_name":"Founder Admin","phone_number":"6431651","account_type":"admin","role":"admin"}'::jsonb,
        updated_at = now()
    WHERE id = _user_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone_number)
  VALUES (_user_id, 'Founder Admin', '6431651')
  ON CONFLICT (id) DO UPDATE SET full_name = 'Founder Admin', phone_number = '6431651';

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
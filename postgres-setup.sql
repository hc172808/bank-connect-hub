-- ============================================================
-- Virtual Bank (NETLIFE CASH) — Complete PostgreSQL Setup
-- Compatible with: PostgreSQL 14+ on Ubuntu 22.04
-- Also works with: Self-hosted Supabase (supabase/postgres image)
--
-- Run as superuser:
--   sudo -u postgres psql -d virtualbank -f postgres-setup.sql
-- ============================================================

-- ── 0. Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 1. Schemas ────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

-- ── 2. Roles (Supabase-compatible) ───────────────────────────────────────────
-- These match Supabase's role model so the JS client works the same way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public  TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

-- ── 3. auth.users table (replaces Supabase Auth) ─────────────────────────────
-- If you ARE using self-hosted Supabase, this table already exists — skip or
-- comment out section 3. If running vanilla PostgreSQL, this creates it.
CREATE TABLE IF NOT EXISTS auth.users (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                text        UNIQUE,
  phone                text        UNIQUE,
  encrypted_password   text,
  raw_user_meta_data   jsonb       NOT NULL DEFAULT '{}',
  raw_app_meta_data    jsonb       NOT NULL DEFAULT '{}',
  role                 text        NOT NULL DEFAULT 'authenticated',
  aud                  text        NOT NULL DEFAULT 'authenticated',
  confirmation_token   text,
  email_confirmed_at   timestamptz,
  phone_confirmed_at   timestamptz,
  last_sign_in_at      timestamptz,
  banned_until         timestamptz,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Index for fast phone lookups (used by the app's phone-based auth)
CREATE INDEX IF NOT EXISTS auth_users_phone_idx ON auth.users(phone);
CREATE INDEX IF NOT EXISTS auth_users_email_idx ON auth.users(email);

GRANT SELECT, INSERT, UPDATE ON auth.users TO service_role, supabase_admin;
GRANT SELECT ON auth.users TO authenticated;

-- ── 4. auth.uid() — session-variable based (Supabase-compatible) ─────────────
-- The app server sets this before each query:
--   SET LOCAL app.current_user_id = '<uuid>';
-- This function returns it, matching the Supabase auth.uid() signature.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

-- Alias in public schema so existing calls without schema prefix still work
CREATE OR REPLACE FUNCTION public.auth_uid()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT auth.uid(); $$;

-- ── 5. extensions.digest helper (pgcrypto alias used by PIN functions) ────────
CREATE OR REPLACE FUNCTION extensions.digest(data text, type text)
RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT pgcrypto.digest(data::bytea, type);
$$;

CREATE OR REPLACE FUNCTION extensions.digest(data bytea, type text)
RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT pgcrypto.digest(data, type);
$$;

-- ── 6. storage schema (minimal — for file references stored in DB) ────────────
CREATE TABLE IF NOT EXISTS storage.buckets (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  public      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id   text REFERENCES storage.buckets(id),
  name        text NOT NULL,
  owner       uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bucket_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO service_role, authenticated;
GRANT SELECT ON storage.buckets TO anon;

-- Seed storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars',       'avatars',       true),
  ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── 7. update_updated_at helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ── 8. app_role enum ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'agent', 'client', 'vendor');
EXCEPTION WHEN duplicate_object THEN
  -- Add vendor if missing
  BEGIN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vendor';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- ── 9. has_role() helper ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- ============================================================
-- TABLES
-- ============================================================

-- ── 10. profiles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid        NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           text,
  phone_number        text        UNIQUE,
  avatar_url          text,
  address             text,
  city                text,
  country             text,
  date_of_birth       date,
  bio                 text,
  wallet_address      text,
  wallet_created_at   timestamptz,
  store_name          text,
  pin_hash            text,
  two_factor_enabled  boolean     NOT NULL DEFAULT false,
  kyc_status          text        NOT NULL DEFAULT 'unverified',
  disabled            boolean     NOT NULL DEFAULT false,
  disabled_at         timestamptz,
  disabled_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profiles_phone_number ON public.profiles(phone_number);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view vendor profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = profiles.id AND ur.role = 'vendor'::app_role
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- ── 11. user_roles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    app_role  NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- ── 12. wallets ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid           NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance    numeric(10,2)  NOT NULL DEFAULT 0.00,
  currency   text           NOT NULL DEFAULT 'USD',
  created_at timestamptz    NOT NULL DEFAULT now(),
  updated_at timestamptz    NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view their own wallet"
  ON public.wallets FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallet"
  ON public.wallets FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet"
  ON public.wallets FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Agents and admins can view all wallets"
  ON public.wallets FOR SELECT
  USING (public.has_role(auth.uid(), 'agent') OR public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

-- ── 13. user_wallets (blockchain) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_wallets (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL UNIQUE,
  wallet_address       text        NOT NULL,
  encrypted_private_key text       NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own blockchain wallet"
  ON public.user_wallets FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own blockchain wallet"
  ON public.user_wallets FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all blockchain wallets"
  ON public.user_wallets FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.user_wallets TO authenticated;
GRANT ALL ON public.user_wallets TO service_role;

-- ── 14. transactions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id        uuid        NOT NULL REFERENCES auth.users(id),
  receiver_id      uuid        NOT NULL REFERENCES auth.users(id),
  amount           numeric     NOT NULL CHECK (amount > 0),
  fee              numeric     NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','completed','failed','cancelled')),
  transaction_type text        NOT NULL
                               CHECK (transaction_type IN ('transfer','deposit','withdrawal','fund_request')),
  description      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  CONSTRAINT no_self_transfer CHECK (sender_id != receiver_id)
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_transactions_sender   ON public.transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON public.transactions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status   ON public.transactions(status);

CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create transactions"
  ON public.transactions FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Transactions cannot be updated"
  ON public.transactions FOR UPDATE USING (false) WITH CHECK (false);

CREATE POLICY "Transactions cannot be deleted"
  ON public.transactions FOR DELETE USING (false);

GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;

-- ── 15. transaction_fees ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transaction_fees (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type text    NOT NULL UNIQUE,
  fee_percentage   numeric NOT NULL DEFAULT 0 CHECK (fee_percentage >= 0 AND fee_percentage <= 100),
  fixed_fee        numeric NOT NULL DEFAULT 0 CHECK (fixed_fee >= 0),
  updated_by       uuid,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view fees"
  ON public.transaction_fees FOR SELECT USING (true);

CREATE POLICY "Admins can manage fees"
  ON public.transaction_fees FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Default fees
INSERT INTO public.transaction_fees (transaction_type, fee_percentage, fixed_fee) VALUES
  ('transfer',    1.0, 0.50),
  ('deposit',     0.0, 0.00),
  ('withdrawal',  0.5, 1.00)
ON CONFLICT (transaction_type) DO NOTHING;

GRANT SELECT ON public.transaction_fees TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.transaction_fees TO authenticated;
GRANT ALL ON public.transaction_fees TO service_role;

-- ── 16. fund_requests ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fund_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id      uuid        NOT NULL REFERENCES auth.users(id),
  payer_id          uuid        NOT NULL REFERENCES auth.users(id),
  amount            numeric     NOT NULL CHECK (amount > 0),
  verification_code text        NOT NULL,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','approved','rejected','completed')),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fund_requests_payer     ON public.fund_requests(payer_id);
CREATE INDEX IF NOT EXISTS idx_fund_requests_requester ON public.fund_requests(requester_id);

CREATE POLICY "Users can view their fund requests"
  ON public.fund_requests FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = payer_id);

CREATE POLICY "Users can create fund requests"
  ON public.fund_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Payers can update fund request status"
  ON public.fund_requests FOR UPDATE USING (auth.uid() = payer_id);

GRANT SELECT, INSERT, UPDATE ON public.fund_requests TO authenticated;
GRANT ALL ON public.fund_requests TO service_role;

-- ── 17. pending_deposits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_deposits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     uuid        NOT NULL REFERENCES auth.users(id),
  user_id      uuid        NOT NULL REFERENCES auth.users(id),
  amount       numeric     NOT NULL CHECK (amount > 0),
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected')),
  approved_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.pending_deposits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_deposits_status ON public.pending_deposits(status);

CREATE POLICY "Agents can view their pending deposits"
  ON public.pending_deposits FOR SELECT
  USING (auth.uid() = agent_id OR public.has_role(auth.uid(), 'agent'));

CREATE POLICY "Admins can view all pending deposits"
  ON public.pending_deposits FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents can create deposits"
  ON public.pending_deposits FOR INSERT
  WITH CHECK (auth.uid() = agent_id AND public.has_role(auth.uid(), 'agent'));

CREATE POLICY "Admins can approve deposits"
  ON public.pending_deposits FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.pending_deposits TO authenticated;
GRANT ALL ON public.pending_deposits TO service_role;

-- ── 18. notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  title      text        NOT NULL,
  message    text        NOT NULL,
  type       text        NOT NULL DEFAULT 'info',
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all notifications"
  ON public.notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ── 19. biometric_credentials ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biometric_credentials (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  credential_id text        NOT NULL UNIQUE,
  public_key    text        NOT NULL,
  device_name   text        DEFAULT 'Unknown Device',
  auth_type     text        NOT NULL DEFAULT 'fingerprint',
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);

ALTER TABLE public.biometric_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own biometric credentials"
  ON public.biometric_credentials FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own biometric credentials"
  ON public.biometric_credentials FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own biometric credentials"
  ON public.biometric_credentials FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own biometric credentials"
  ON public.biometric_credentials FOR UPDATE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.biometric_credentials TO authenticated;
GRANT ALL ON public.biometric_credentials TO service_role;

-- ── 20. two_factor_auth ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.two_factor_auth (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE,
  secret       text        NOT NULL,
  backup_codes text[]      NOT NULL DEFAULT '{}',
  enabled      boolean     NOT NULL DEFAULT false,
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.two_factor_auth ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_2fa_updated_at
  BEFORE UPDATE ON public.two_factor_auth
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users manage their own 2FA"
  ON public.two_factor_auth FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all 2FA"
  ON public.two_factor_auth FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factor_auth TO authenticated;
GRANT ALL ON public.two_factor_auth TO service_role;

-- ── 21. device_sessions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  device_name   text,
  browser       text,
  os            text,
  ip_address    text,
  location      text,
  user_agent    text,
  is_current    boolean     NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sessions"
  ON public.device_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all sessions"
  ON public.device_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sessions TO authenticated;
GRANT ALL ON public.device_sessions TO service_role;

-- ── 22. audit_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid,
  actor_role  text,
  action      text        NOT NULL,
  entity_type text,
  entity_id   text,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor       ON public.audit_logs(actor_id);

CREATE POLICY "Anyone authenticated can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);

CREATE POLICY "Admins view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- ── 23. kyc_submissions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  full_name           text        NOT NULL,
  date_of_birth       date        NOT NULL,
  address             text        NOT NULL,
  country             text        NOT NULL,
  document_type       text        NOT NULL,
  document_number     text        NOT NULL,
  document_front_url  text,
  document_back_url   text,
  selfie_url          text,
  status              text        NOT NULL DEFAULT 'pending',
  rejection_reason    text,
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_kyc_updated_at
  BEFORE UPDATE ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users view their own KYC"
  ON public.kyc_submissions FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create their own KYC"
  ON public.kyc_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own pending KYC"
  ON public.kyc_submissions FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins update any KYC"
  ON public.kyc_submissions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.kyc_submissions TO authenticated;
GRANT ALL ON public.kyc_submissions TO service_role;

-- ── 24. suspicious_activity_alerts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suspicious_activity_alerts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,
  alert_type  text        NOT NULL,
  severity    text        NOT NULL DEFAULT 'medium',
  description text        NOT NULL,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  status      text        NOT NULL DEFAULT 'open',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suspicious_activity_alerts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON public.suspicious_activity_alerts(created_at DESC);

CREATE POLICY "Anyone authenticated can create alerts"
  ON public.suspicious_activity_alerts FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins view all alerts"
  ON public.suspicious_activity_alerts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view their own alerts"
  ON public.suspicious_activity_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins update alerts"
  ON public.suspicious_activity_alerts FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.suspicious_activity_alerts TO authenticated;
GRANT ALL ON public.suspicious_activity_alerts TO service_role;

-- ── 25. fund_reversals ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fund_reversals (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   uuid        NOT NULL,
  requester_id     uuid        NOT NULL,
  recipient_id     uuid        NOT NULL,
  amount           numeric     NOT NULL,
  reason           text,
  status           text        NOT NULL DEFAULT 'pending',
  approved_by      uuid,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  approved_at      timestamptz,
  funds_held_at    timestamptz,
  funds_returned_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fund_reversals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reversal requests"
  ON public.fund_reversals FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can view their own reversals"
  ON public.fund_reversals FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

CREATE POLICY "Admins can view all reversals"
  ON public.fund_reversals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update reversals"
  ON public.fund_reversals FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Agents can view all reversals"
  ON public.fund_reversals FOR SELECT
  USING (public.has_role(auth.uid(), 'agent'));

CREATE POLICY "Agents can update reversals"
  ON public.fund_reversals FOR UPDATE
  USING (public.has_role(auth.uid(), 'agent'));

GRANT SELECT, INSERT, UPDATE ON public.fund_reversals TO authenticated;
GRANT ALL ON public.fund_reversals TO service_role;

-- ── 26. blockchain_settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blockchain_settings (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_url                   text,
  chain_id                  text,
  native_coin_symbol        text        NOT NULL DEFAULT 'GYD',
  native_coin_name          text        NOT NULL DEFAULT 'GYD Coin',
  explorer_url              text,
  is_active                 boolean     NOT NULL DEFAULT false,
  updated_by                uuid,
  liquidity_pool_address    text,
  fee_wallet_address        text,
  fee_wallet_encrypted_key  text,
  gas_fee_gyd               numeric     NOT NULL DEFAULT 0.01,
  rpc_urls                  jsonb       DEFAULT '[]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blockchain_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_blockchain_settings_updated_at
  BEFORE UPDATE ON public.blockchain_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated users can view blockchain settings"
  ON public.blockchain_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage blockchain settings"
  ON public.blockchain_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.blockchain_settings (native_coin_symbol, native_coin_name, is_active)
  VALUES ('GYD', 'GYD Coin', false)
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.blockchain_settings TO authenticated;
GRANT ALL ON public.blockchain_settings TO service_role;

-- ── 27. supported_coins ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supported_coins (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coin_symbol      text        NOT NULL UNIQUE,
  coin_name        text        NOT NULL,
  contract_address text,
  is_native        boolean     NOT NULL DEFAULT false,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supported_coins ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_supported_coins_updated_at
  BEFORE UPDATE ON public.supported_coins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Everyone can view supported coins"
  ON public.supported_coins FOR SELECT USING (true);

CREATE POLICY "Admins can manage supported coins"
  ON public.supported_coins FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.supported_coins (coin_symbol, coin_name, is_native, is_active)
  VALUES ('GYD', 'GYD Coin', true, true)
ON CONFLICT (coin_symbol) DO NOTHING;

GRANT SELECT ON public.supported_coins TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.supported_coins TO authenticated;
GRANT ALL ON public.supported_coins TO service_role;

-- ── 28. conversion_fees ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversion_fees (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_coin      text        NOT NULL,
  to_coin        text        NOT NULL,
  fee_percentage numeric     NOT NULL DEFAULT 1.0,
  is_active      boolean     NOT NULL DEFAULT true,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_coin, to_coin)
);

ALTER TABLE public.conversion_fees ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_conversion_fees_updated_at
  BEFORE UPDATE ON public.conversion_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Everyone can view conversion fees"
  ON public.conversion_fees FOR SELECT USING (true);

CREATE POLICY "Admins can manage conversion fees"
  ON public.conversion_fees FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.conversion_fees TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.conversion_fees TO authenticated;
GRANT ALL ON public.conversion_fees TO service_role;

-- ── 29. feature_toggles ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feature_toggles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text        NOT NULL UNIQUE,
  feature_name text       NOT NULL,
  is_enabled  boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_feature_toggles_updated_at
  BEFORE UPDATE ON public.feature_toggles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Everyone can view feature toggles"
  ON public.feature_toggles FOR SELECT USING (true);

CREATE POLICY "Admins can manage feature toggles"
  ON public.feature_toggles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.feature_toggles (feature_key, feature_name, is_enabled) VALUES
  ('pay_bills',     'Pay Bills',       false),
  ('top_up',        'Mobile Top-up',   false),
  ('pay_merchant',  'Pay Merchant',    false)
ON CONFLICT (feature_key) DO NOTHING;

GRANT SELECT ON public.feature_toggles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.feature_toggles TO authenticated;
GRANT ALL ON public.feature_toggles TO service_role;

-- ── 30. vendor_products ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_products (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid        NOT NULL,
  name           text        NOT NULL,
  description    text,
  logo_url       text,
  price          numeric     NOT NULL,
  discount_price numeric,
  category       text,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_vendor_products_updated_at
  BEFORE UPDATE ON public.vendor_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Vendors can manage their own products"
  ON public.vendor_products FOR ALL USING (auth.uid() = vendor_id);

CREATE POLICY "Everyone can view active products"
  ON public.vendor_products FOR SELECT USING (is_active = true);

GRANT SELECT ON public.vendor_products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.vendor_products TO authenticated;
GRANT ALL ON public.vendor_products TO service_role;

-- ── 31. vendor_registration_fees ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_registration_fees (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_amount numeric     NOT NULL DEFAULT 0,
  fee_name   text        NOT NULL DEFAULT 'Vendor Registration Fee',
  is_active  boolean     NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.vendor_registration_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage vendor registration fees"
  ON public.vendor_registration_fees FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view vendor registration fees"
  ON public.vendor_registration_fees FOR SELECT TO authenticated USING (true);

INSERT INTO public.vendor_registration_fees (fee_name, fee_amount, is_active)
  VALUES ('Vendor Registration Fee', 50.00, true)
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.vendor_registration_fees TO authenticated;
GRANT ALL ON public.vendor_registration_fees TO service_role;

-- ── 32. gas_fee_ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gas_fee_ledger (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type       text        NOT NULL,
  amount                 numeric     NOT NULL,
  related_transaction_id uuid,
  user_id                uuid,
  description            text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gas_fee_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage gas fee ledger"
  ON public.gas_fee_ledger FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.gas_fee_ledger TO authenticated;
GRANT ALL ON public.gas_fee_ledger TO service_role;

-- ── 33. mobile_money_providers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mobile_money_providers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  ussd_code       text,
  logo_letter     text        NOT NULL DEFAULT '?',
  color           text        NOT NULL DEFAULT 'bg-muted-foreground',
  merchant_number text,
  instructions    text,
  is_active       boolean     NOT NULL DEFAULT true,
  sort_order      integer     NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mobile_money_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active providers"
  ON public.mobile_money_providers FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage providers"
  ON public.mobile_money_providers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.mobile_money_providers (name, ussd_code, logo_letter, color, merchant_number, sort_order) VALUES
  ('Digicel MoMo',    '*129#', 'D', 'bg-red-500',   '+592-000-0001', 1),
  ('GTT Mobile Money','*888#', 'G', 'bg-green-600', '+592-000-0001', 2),
  ('M-Pesa',          '*234#', 'M', 'bg-green-500', '+592-000-0001', 3)
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.mobile_money_providers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.mobile_money_providers TO authenticated;
GRANT ALL ON public.mobile_money_providers TO service_role;

-- ── 34. changelog_entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.changelog_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version     text        NOT NULL,
  is_latest   boolean     NOT NULL DEFAULT false,
  items       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid
);

ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view changelog"
  ON public.changelog_entries FOR SELECT USING (true);

CREATE POLICY "Admins can manage changelog"
  ON public.changelog_entries FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.changelog_entries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.changelog_entries TO authenticated;
GRANT ALL ON public.changelog_entries TO service_role;

-- ── 35. app_releases ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_releases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text        NOT NULL,
  platform      text        NOT NULL DEFAULT 'web',
  file_url      text        NOT NULL,
  file_path     text,
  file_size     bigint,
  release_notes text,
  is_force_update boolean   NOT NULL DEFAULT false,
  is_latest     boolean     NOT NULL DEFAULT false,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Everyone can view app releases"
  ON public.app_releases FOR SELECT USING (true);

CREATE POLICY "Admins can manage app releases"
  ON public.app_releases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.app_releases TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

-- ── 36. app_settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text        NOT NULL UNIQUE,
  value      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view app settings"
  ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Admins can manage app settings"
  ON public.app_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- ── 37. qr_card_requests ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qr_card_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending',
  notes        text,
  fulfilled_by uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz
);

ALTER TABLE public.qr_card_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own qr requests"
  ON public.qr_card_requests FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create qr requests"
  ON public.qr_card_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update qr requests"
  ON public.qr_card_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_card_requests TO authenticated;
GRANT ALL ON public.qr_card_requests TO service_role;

-- ── 38. announcements ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.announcements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  body       text,
  image_url  text,
  link_url   text,
  starts_at  timestamptz NOT NULL DEFAULT now(),
  ends_at    timestamptz,
  is_active  boolean     NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Everyone can view active announcements"
  ON public.announcements FOR SELECT
  USING (is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at >= now()));

CREATE POLICY "Admins view all announcements"
  ON public.announcements FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage announcements"
  ON public.announcements FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.announcements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;

-- ── 39. countries ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.countries (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text    NOT NULL UNIQUE,
  name                text    NOT NULL,
  dial_code           text    NOT NULL,
  local_number_length int     NOT NULL DEFAULT 7,
  is_allowed          boolean NOT NULL DEFAULT true,
  is_banned           boolean NOT NULL DEFAULT false,
  sort_order          int     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Everyone can view countries"
  ON public.countries FOR SELECT USING (true);

CREATE POLICY "Admins manage countries"
  ON public.countries FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.countries (code, name, dial_code, local_number_length, sort_order) VALUES
  ('GY', 'Guyana',             '+592',  7,  1),
  ('TT', 'Trinidad & Tobago',  '+1868', 7,  2),
  ('JM', 'Jamaica',            '+1876', 7,  3),
  ('SR', 'Suriname',           '+597',  7,  4),
  ('BB', 'Barbados',           '+1246', 7,  5),
  ('US', 'United States',      '+1',    10, 6),
  ('CA', 'Canada',             '+1',    10, 7),
  ('GB', 'United Kingdom',     '+44',   10, 8),
  ('BR', 'Brazil',             '+55',   11, 9),
  ('IN', 'India',              '+91',   10, 10),
  ('NG', 'Nigeria',            '+234',  10, 11)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT ON public.countries TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.countries TO authenticated;
GRANT ALL ON public.countries TO service_role;

-- ── 40. external_databases ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_databases (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  host          text        NOT NULL,
  port          integer     NOT NULL DEFAULT 5432,
  database_name text        NOT NULL,
  username      text        NOT NULL,
  secret_key    text        NOT NULL,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_databases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage external databases"
  ON public.external_databases FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_databases TO authenticated;
GRANT ALL ON public.external_databases TO service_role;

-- ── 41. database_backups ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.database_backups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_db_id  uuid        REFERENCES public.external_databases(id) ON DELETE SET NULL,
  backup_name     text        NOT NULL,
  backup_type     text        NOT NULL DEFAULT 'manual',
  status          text        NOT NULL DEFAULT 'pending',
  file_size       bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.database_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage database backups"
  ON public.database_backups FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.database_backups TO authenticated;
GRANT ALL ON public.database_backups TO service_role;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- ── 42. handle_new_user (trigger on auth.users) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_type text;
  user_role    app_role;
BEGIN
  account_type := (NEW.raw_user_meta_data->>'account_type')::text;

  IF account_type = 'vendor' THEN
    user_role := 'vendor'::app_role;
  ELSE
    user_role := 'client'::app_role;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone_number, wallet_address, wallet_created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone_number', ''),
    NEW.raw_user_meta_data->>'wallet_address',
    CASE WHEN NEW.raw_user_meta_data->>'wallet_address' IS NOT NULL THEN now() ELSE NULL END
  );

  INSERT INTO public.wallets (user_id, balance, currency)
  VALUES (NEW.id, 0, 'USD');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 43. PIN functions ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hash_pin(pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN encode(digest(pin::bytea, 'sha256'), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_pin(user_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET pin_hash = encode(digest(user_pin::bytea, 'sha256'), 'hex')
  WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_pin(user_id uuid, pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT pin_hash INTO stored_hash FROM profiles WHERE id = user_id;
  IF stored_hash IS NULL THEN RETURN FALSE; END IF;
  RETURN stored_hash = encode(digest(pin::bytea, 'sha256'), 'hex');
END;
$$;

-- ── 44. process_transaction (double-spend safe, admin unlimited) ──────────────
CREATE OR REPLACE FUNCTION public.process_transaction(
  _sender_id       uuid,
  _receiver_id     uuid,
  _amount          numeric,
  _transaction_type text,
  _description     text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _sender_balance    numeric;
  _fee_percentage    numeric;
  _fixed_fee         numeric;
  _total_fee         numeric;
  _total_amount      numeric;
  _transaction_id    uuid;
  _sender_cashback   numeric;
  _liquidity_fee     numeric;
  _is_admin          boolean;
  _sender_disabled   boolean;
  _receiver_disabled boolean;
BEGIN
  SELECT disabled INTO _sender_disabled   FROM public.profiles WHERE id = _sender_id;
  SELECT disabled INTO _receiver_disabled FROM public.profiles WHERE id = _receiver_id;

  IF COALESCE(_sender_disabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your account is disabled. Contact support.');
  END IF;
  IF COALESCE(_receiver_disabled, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient account is disabled.');
  END IF;

  SELECT public.has_role(_sender_id, 'admin') INTO _is_admin;

  SELECT balance INTO _sender_balance
  FROM public.wallets WHERE user_id = _sender_id FOR UPDATE;

  SELECT fee_percentage, fixed_fee INTO _fee_percentage, _fixed_fee
  FROM public.transaction_fees WHERE transaction_type = _transaction_type;

  IF _is_admin THEN
    _total_fee := 0; _sender_cashback := 0; _liquidity_fee := 0; _total_amount := _amount;
  ELSE
    _total_fee     := (_amount * COALESCE(_fee_percentage, 0) / 100) + COALESCE(_fixed_fee, 0);
    _sender_cashback := _total_fee * 0.60;
    _liquidity_fee := _total_fee * 0.40;
    _total_amount  := _amount + _liquidity_fee;
  END IF;

  IF NOT _is_admin AND _sender_balance < _total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  IF NOT _is_admin THEN
    UPDATE public.wallets SET balance = balance - _total_amount, updated_at = now()
    WHERE user_id = _sender_id;
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (_receiver_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = wallets.balance + _amount, updated_at = now();

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES
    (_sender_id, _receiver_id, _amount, _total_fee, 'completed', _transaction_type, _description, now())
  RETURNING id INTO _transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', _transaction_id,
    'fee', _total_fee,
    'sender_cashback', _sender_cashback,
    'liquidity_pool_fee', _liquidity_fee
  );
END;
$$;

-- ── 45. admin_add_funds ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_funds(_user_id uuid, _amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.wallets SET balance = balance + _amount, updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.transactions
    (sender_id, receiver_id, amount, fee, status, transaction_type, description, completed_at)
  VALUES (auth.uid(), _user_id, _amount, 0, 'completed', 'deposit', 'Admin deposit', now());

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ── 46. approve_fund_reversal ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_fund_reversal(_reversal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _reversal          record;
  _recipient_balance numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'agent')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _reversal FROM public.fund_reversals WHERE id = _reversal_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal not found or already processed');
  END IF;

  SELECT balance INTO _recipient_balance FROM public.wallets
  WHERE user_id = _reversal.recipient_id FOR UPDATE;

  IF _recipient_balance < _reversal.amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient has insufficient balance');
  END IF;

  UPDATE public.wallets SET balance = balance - _reversal.amount, updated_at = now()
  WHERE user_id = _reversal.recipient_id;

  UPDATE public.fund_reversals
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(), funds_held_at = now()
  WHERE id = _reversal_id;

  INSERT INTO public.notifications (user_id, title, message, type) VALUES
    (_reversal.recipient_id, 'Fund Reversal',
     'A reversal of $' || _reversal.amount || ' has been processed from your account.', 'warning'),
    (_reversal.requester_id, 'Reversal Approved',
     'Your reversal request for $' || _reversal.amount || ' was approved. Funds return within 1 hour.', 'success');

  RETURN jsonb_build_object('success', true, 'message', 'Funds deducted. Will return to sender in 1 hour.');
END;
$$;

-- ── 47. process_pending_reversals (run via pg_cron or cron job) ───────────────
CREATE OR REPLACE FUNCTION public.process_pending_reversals()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _reversal  record;
  _processed int := 0;
BEGIN
  FOR _reversal IN
    SELECT * FROM public.fund_reversals
    WHERE status = 'approved'
      AND funds_held_at IS NOT NULL
      AND funds_held_at + interval '1 hour' <= now()
  LOOP
    UPDATE public.wallets SET balance = balance + _reversal.amount, updated_at = now()
    WHERE user_id = _reversal.requester_id;

    UPDATE public.fund_reversals SET status = 'completed', funds_returned_at = now()
    WHERE id = _reversal.id;

    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (_reversal.requester_id, 'Funds Returned',
      '$' || _reversal.amount || ' has been returned to your account.', 'success');

    _processed := _processed + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'processed', _processed);
END;
$$;

-- ── 48. log_audit_event ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action      text,
  _entity_type text DEFAULT NULL,
  _entity_id   text DEFAULT NULL,
  _metadata    jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _id   uuid;
  _role text;
BEGIN
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _role, _action, _entity_type, _entity_id, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- ── 49. notify_transaction ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _sender_name   text;
  _receiver_name text;
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT full_name INTO _sender_name   FROM profiles WHERE id = NEW.sender_id;
  SELECT full_name INTO _receiver_name FROM profiles WHERE id = NEW.receiver_id;

  INSERT INTO notifications (user_id, title, message, type) VALUES
    (NEW.receiver_id, 'Payment Received',
     'You received $' || NEW.amount || ' from ' || COALESCE(_sender_name, 'someone'), 'success');

  IF NEW.transaction_type = 'transfer' THEN
    INSERT INTO notifications (user_id, title, message, type) VALUES
      (NEW.sender_id, 'Payment Sent',
       'You sent $' || NEW.amount || ' to ' || COALESCE(_receiver_name, 'someone'), 'info');
  ELSIF NEW.transaction_type = 'deposit' THEN
    INSERT INTO notifications (user_id, title, message, type) VALUES
      (NEW.receiver_id, 'Deposit Received',
       'Your account was credited with $' || NEW.amount, 'success');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_transaction_completed
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.notify_transaction();

-- ── 50. flag_suspicious_transaction ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.flag_suspicious_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _recent_count int;
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.amount >= 10000 THEN
      INSERT INTO public.suspicious_activity_alerts (user_id, alert_type, severity, description, metadata)
      VALUES (NEW.sender_id, 'large_transaction', 'high',
        'Large transaction of $' || NEW.amount || ' detected',
        jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount));
    END IF;

    SELECT COUNT(*) INTO _recent_count FROM public.transactions
    WHERE sender_id = NEW.sender_id
      AND created_at > now() - interval '5 minutes'
      AND status = 'completed';

    IF _recent_count >= 5 THEN
      INSERT INTO public.suspicious_activity_alerts (user_id, alert_type, severity, description, metadata)
      VALUES (NEW.sender_id, 'rapid_transactions', 'medium',
        _recent_count || ' transactions in last 5 minutes',
        jsonb_build_object('count', _recent_count));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_suspicious_transaction ON public.transactions;
CREATE TRIGGER trg_flag_suspicious_transaction
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.flag_suspicious_transaction();

-- ── 51. public_vendors view ───────────────────────────────────────────────────
DROP VIEW IF EXISTS public.public_vendors;
CREATE VIEW public.public_vendors
WITH (security_invoker = on) AS
SELECT p.id, p.full_name, p.store_name, p.avatar_url, p.wallet_address
FROM public.profiles p
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = p.id AND ur.role = 'vendor'::app_role
);

GRANT SELECT ON public.public_vendors TO authenticated;

-- ============================================================
-- REALTIME (optional — enables pg_notify for live updates)
-- Only needed if you are running the Supabase Realtime service.
-- Comment out if using vanilla PostgreSQL only.
-- ============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- DONE
-- ============================================================
DO $$ BEGIN
  RAISE NOTICE '✅  Virtual Bank database setup complete.';
  RAISE NOTICE '    Tables: profiles, user_roles, wallets, transactions, ...';
  RAISE NOTICE '    Run: SELECT tablename FROM pg_tables WHERE schemaname = ''public'' ORDER BY 1;';
END $$;

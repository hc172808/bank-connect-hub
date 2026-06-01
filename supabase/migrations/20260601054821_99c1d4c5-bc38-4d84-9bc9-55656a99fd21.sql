
-- 2FA
CREATE TABLE public.two_factor_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  secret text NOT NULL,
  backup_codes text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.two_factor_auth TO authenticated;
GRANT ALL ON public.two_factor_auth TO service_role;
ALTER TABLE public.two_factor_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own 2FA" ON public.two_factor_auth FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all 2FA" ON public.two_factor_auth FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Device Sessions
CREATE TABLE public.device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_name text,
  browser text,
  os text,
  ip_address text,
  location text,
  user_agent text,
  is_current boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sessions TO authenticated;
GRANT ALL ON public.device_sessions TO service_role;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own sessions" ON public.device_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all sessions" ON public.device_sessions FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

-- Audit Logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id);
CREATE POLICY "Admins view all audit logs" ON public.audit_logs FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);

-- KYC Submissions
CREATE TABLE public.kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  address text NOT NULL,
  country text NOT NULL,
  document_type text NOT NULL,
  document_number text NOT NULL,
  document_front_url text,
  document_back_url text,
  selfie_url text,
  status text NOT NULL DEFAULT 'pending',
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.kyc_submissions TO authenticated;
GRANT ALL ON public.kyc_submissions TO service_role;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their own KYC" ON public.kyc_submissions FOR SELECT USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users create their own KYC" ON public.kyc_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own pending KYC" ON public.kyc_submissions FOR UPDATE USING (auth.uid() = user_id AND status = 'pending');
CREATE POLICY "Admins update any KYC" ON public.kyc_submissions FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

-- Suspicious Activity Alerts
CREATE TABLE public.suspicious_activity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.suspicious_activity_alerts TO authenticated;
GRANT ALL ON public.suspicious_activity_alerts TO service_role;
ALTER TABLE public.suspicious_activity_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can create alerts" ON public.suspicious_activity_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins view all alerts" ON public.suspicious_activity_alerts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users view their own alerts" ON public.suspicious_activity_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins update alerts" ON public.suspicious_activity_alerts FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_alerts_created_at ON public.suspicious_activity_alerts(created_at DESC);

-- Add 2FA flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_status text NOT NULL DEFAULT 'unverified';

-- Audit log helper
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _role text;
BEGIN
  SELECT role::text INTO _role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _role, _action, _entity_type, _entity_id, _metadata)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- Auto-flag large transactions
CREATE OR REPLACE FUNCTION public.flag_suspicious_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _recent_count int;
BEGIN
  IF NEW.status = 'completed' THEN
    -- Large amount
    IF NEW.amount >= 10000 THEN
      INSERT INTO public.suspicious_activity_alerts (user_id, alert_type, severity, description, metadata)
      VALUES (NEW.sender_id, 'large_transaction', 'high',
        'Large transaction of $' || NEW.amount || ' detected',
        jsonb_build_object('transaction_id', NEW.id, 'amount', NEW.amount));
    END IF;

    -- Rapid transactions
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

-- Storage bucket for KYC docs
INSERT INTO storage.buckets (id, name, public) VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload their own KYC docs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'kyc-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users view their own KYC docs" ON storage.objects FOR SELECT
  USING (bucket_id = 'kyc-documents' AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins manage KYC docs" ON storage.objects FOR ALL
  USING (bucket_id = 'kyc-documents' AND has_role(auth.uid(), 'admin'::app_role));

-- Updated_at triggers
CREATE TRIGGER trg_2fa_updated_at BEFORE UPDATE ON public.two_factor_auth FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_kyc_updated_at BEFORE UPDATE ON public.kyc_submissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Durable, service-key-only challenges for staff-assisted password recovery.
-- The code is stored as a SHA-256 hash; the submitted ID number is checked
-- against the user's KYC document_number at verification time.
CREATE TABLE IF NOT EXISTS public.password_reset_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_password_reset_challenges_user
  ON public.password_reset_challenges(user_id, created_at DESC);

ALTER TABLE public.password_reset_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_challenges FROM anon, authenticated;
GRANT ALL ON public.password_reset_challenges TO service_role;
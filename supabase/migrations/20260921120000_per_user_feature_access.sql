-- Per-user feature controls for the client menu. Missing rows intentionally
-- mean enabled, so existing users keep their current menu until an admin
-- explicitly disables an item.
CREATE TABLE IF NOT EXISTS public.user_feature_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (user_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_access_user
  ON public.user_feature_access(user_id);

ALTER TABLE public.user_feature_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_feature_access FROM anon, authenticated;
GRANT ALL ON public.user_feature_access TO service_role;
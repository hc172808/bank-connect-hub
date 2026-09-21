-- Backfill profile identity fields for accounts created before the profile
-- trigger/schema repair. Auth metadata is the existing source of truth.
UPDATE public.profiles AS p
SET
  full_name = COALESCE(NULLIF(BTRIM(p.full_name), ''), NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), '')),
  phone_number = COALESCE(NULLIF(BTRIM(p.phone_number), ''), NULLIF(BTRIM(u.raw_user_meta_data ->> 'phone_number'), '')),
  updated_at = now()
FROM auth.users AS u
WHERE u.id = p.id
  AND (
    (NULLIF(BTRIM(p.full_name), '') IS NULL AND NULLIF(BTRIM(u.raw_user_meta_data ->> 'full_name'), '') IS NOT NULL)
    OR
    (NULLIF(BTRIM(p.phone_number), '') IS NULL AND NULLIF(BTRIM(u.raw_user_meta_data ->> 'phone_number'), '') IS NOT NULL)
  );

-- Feature flags are public read-only configuration. Keep writes behind the
-- server-side admin endpoint, but allow authenticated clients to read them
-- directly if the server proxy is unavailable.
ALTER TABLE public.feature_toggles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view feature toggles" ON public.feature_toggles;
CREATE POLICY "Everyone can view feature toggles"
  ON public.feature_toggles FOR SELECT
  USING (true);
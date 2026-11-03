-- Existing reversal decision functions recognize founders alongside admins and agents.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'founder';

GRANT SELECT ON TABLE public.fund_reversals TO authenticated;
GRANT ALL ON TABLE public.fund_reversals TO service_role;

CREATE POLICY "Founders can view all reversals"
ON public.fund_reversals FOR SELECT TO authenticated
USING (public.is_reserve_manager(auth.uid()));

NOTIFY pgrst, 'reload schema';
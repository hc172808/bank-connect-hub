-- Supabase Cron runs due reversal returns every minute. The database function
-- itself enforces the full one-hour hold and safely handles concurrent runs.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'netlifecash-process-fund-reversals',
  '* * * * *',
  'SELECT public.process_pending_reversals();'
);

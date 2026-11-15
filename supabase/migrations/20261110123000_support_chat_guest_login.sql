-- Allow unauthenticated login-help visitors to join the human support queue.
-- Guest sessions are still only accessible through authenticated server routes;
-- the browser holds an HttpOnly bearer cookie, never direct table access.

ALTER TABLE public.support_chat_sessions
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.support_chat_sessions
  ADD COLUMN IF NOT EXISTS guest_token_hash text,
  ADD COLUMN IF NOT EXISTS guest_display_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_chat_sessions_owner_check'
      AND conrelid = 'public.support_chat_sessions'::regclass
  ) THEN
    ALTER TABLE public.support_chat_sessions
      ADD CONSTRAINT support_chat_sessions_owner_check
      CHECK (
        (user_id IS NOT NULL AND guest_token_hash IS NULL)
        OR (
          user_id IS NULL
          AND guest_token_hash IS NOT NULL
          AND guest_token_hash ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS support_chat_sessions_one_open_per_guest_idx
  ON public.support_chat_sessions (guest_token_hash)
  WHERE user_id IS NULL
    AND guest_token_hash IS NOT NULL
    AND status <> 'closed';

-- Store only a salted, slow hash of a user's recovery answer.
-- Access is server-only; the answer is never readable by browser clients.
CREATE TABLE IF NOT EXISTS public.user_security_questions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 6 AND 160),
  answer_salt text NOT NULL CHECK (answer_salt ~ '^[0-9a-f]{32}$'),
  answer_hash text NOT NULL CHECK (answer_hash ~ '^[0-9a-f]{128}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_security_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_security_questions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_security_questions TO service_role;

CREATE INDEX IF NOT EXISTS user_security_questions_updated_at_idx
  ON public.user_security_questions (updated_at DESC);

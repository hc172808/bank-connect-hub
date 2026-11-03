-- Support chat data is accessed only by authenticated server routes using the
-- service role. The browser never receives direct access to these tables.
CREATE TABLE IF NOT EXISTS public.support_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'active', 'ai', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.support_chat_sessions(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'agent', 'assistant', 'system')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_chat_presence (
  agent_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_chat_sessions_waiting_idx
  ON public.support_chat_sessions (created_at)
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS support_chat_sessions_user_open_idx
  ON public.support_chat_sessions (user_id, updated_at DESC)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS support_chat_sessions_agent_open_idx
  ON public.support_chat_sessions (agent_id, updated_at DESC)
  WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS support_chat_sessions_one_open_per_user_idx
  ON public.support_chat_sessions (user_id)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS support_chat_messages_session_created_idx
  ON public.support_chat_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS support_chat_presence_online_idx
  ON public.support_chat_presence (last_seen_at DESC)
  WHERE available = true;

ALTER TABLE public.support_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_chat_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_chat_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_chat_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_chat_presence FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_chat_sessions TO service_role;
GRANT ALL ON TABLE public.support_chat_messages TO service_role;
GRANT ALL ON TABLE public.support_chat_presence TO service_role;

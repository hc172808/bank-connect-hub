import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Clock3, MessageCircle, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type GuestSupportStatus = "waiting" | "active" | "closed";
type GuestSenderRole = "user" | "agent" | "system";

interface GuestSupportSession {
  id: string;
  status: GuestSupportStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface GuestSupportMessage {
  id: string;
  session_id: string;
  sender_id: string | null;
  sender_role: GuestSenderRole;
  body: string;
  created_at: string;
}

interface GuestSupportEnvelope {
  session: GuestSupportSession;
  messages: GuestSupportMessage[];
}

async function guestSupportRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: "same-origin",
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : {};
    throw new Error(
      typeof record.error === "string"
        ? record.error
        : "Login support chat could not complete the request.",
    );
  }
  return payload as T;
}

function messageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function GuestSupportConversation() {
  const [session, setSession] = useState<GuestSupportSession | null>(null);
  const [messages, setMessages] = useState<GuestSupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const refreshConversation = useCallback(async (sessionId: string) => {
    const result = await guestSupportRequest<GuestSupportEnvelope>(
      `/api/support-chat/guest/${encodeURIComponent(sessionId)}`,
    );
    setSession(result.session);
    setMessages(result.messages ?? []);
  }, []);

  useEffect(() => {
    let active = true;
    void guestSupportRequest<GuestSupportEnvelope>("/api/support-chat/guest/open", "POST", {})
      .then((result) => {
        if (!active) return;
        setSession(result.session);
        setMessages(result.messages ?? []);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error
            ? requestError.message
            : "Login support chat could not be opened.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.id || session.status === "closed") return;
    let active = true;
    const timer = window.setInterval(() => {
      void refreshConversation(session.id).catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error
            ? requestError.message
            : "Login support chat could not be refreshed.");
        }
      });
    }, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshConversation, session?.id, session?.status]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!session || !body || sending || session.status === "closed") return;
    setSending(true);
    setError(null);
    try {
      const result = await guestSupportRequest<GuestSupportEnvelope>(
        `/api/support-chat/guest/${encodeURIComponent(session.id)}/messages`,
        "POST",
        { body },
      );
      setSession(result.session);
      setMessages(result.messages ?? []);
      setDraft("");
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-[320px] flex-col">
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <Clock3 size={15} className="shrink-0" />
        {session?.status === "active"
          ? "A support agent has joined."
          : "Your message will be added to the human support queue."}
      </div>

      <div
        className="flex max-h-[42vh] min-h-[190px] flex-1 flex-col gap-3 overflow-y-auto rounded-xl border bg-muted/20 p-3"
        aria-live="polite"
        aria-label="Login support conversation"
        data-testid="login-support-messages"
      >
        {loading ? (
          <p className="m-auto text-sm text-muted-foreground">Opening in-app support…</p>
        ) : messages.length === 0 ? (
          <p className="m-auto text-center text-sm text-muted-foreground">
            Send a message and an agent will reply here.
          </p>
        ) : messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
              message.sender_role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : message.sender_role === "system"
                  ? "mx-auto bg-muted text-center text-xs text-muted-foreground"
                  : "mr-auto border bg-background"
            }`}
          >
            {message.sender_role === "agent" && (
              <p className="mb-1 text-[10px] font-semibold text-muted-foreground">Support agent</p>
            )}
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <p className={`mt-1 text-[10px] ${
              message.sender_role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}>
              {messageTime(message.created_at)}
            </p>
          </div>
        ))}
        <div ref={messageEndRef} />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive" data-testid="login-support-error">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
        <ShieldAlert size={15} className="mt-0.5 shrink-0" />
        <p>Never send your password, PIN, or one-time verification code in chat.</p>
      </div>

      <form onSubmit={sendMessage} className="mt-3 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Describe your sign-in problem…"
          maxLength={2000}
          rows={2}
          disabled={loading || sending || !session || session.status === "closed"}
          aria-label="Message support"
          data-testid="login-support-input"
        />
        <Button
          type="submit"
          size="icon"
          disabled={loading || sending || !draft.trim() || !session || session.status === "closed"}
          aria-label="Send message"
          data-testid="login-support-send"
        >
          <Send size={16} />
        </Button>
      </form>
    </div>
  );
}

export function LoginSupportChat() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full gap-2 text-primary"
          data-testid="button-login-support-chat"
        >
          <MessageCircle size={18} /> Chat with an agent
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md" data-testid="login-support-dialog">
        <DialogHeader>
          <DialogTitle>In-app login support</DialogTitle>
          <DialogDescription>
            Ask for help signing in. Your conversation stays in this app.
          </DialogDescription>
        </DialogHeader>
        {open && <GuestSupportConversation />}
      </DialogContent>
    </Dialog>
  );
}

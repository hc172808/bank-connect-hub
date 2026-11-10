import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X, Send, Headset, ArrowLeft, RotateCw, UserRound, Bot, ShieldCheck, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type SupportStatus = "waiting" | "active" | "ai" | "closed";
type SenderRole = "user" | "agent" | "assistant" | "system";

interface SupportSession {
  id: string;
  user_id: string;
  agent_id: string | null;
  status: SupportStatus;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface SupportMessage {
  id: string;
  session_id: string;
  sender_id: string | null;
  sender_role: SenderRole;
  body: string;
  created_at: string;
}

interface QueueSession extends SupportSession {
  display_name: string;
}

interface ConversationEnvelope {
  session: SupportSession;
  messages: SupportMessage[];
}

interface QueueEnvelope {
  waiting: QueueSession[];
  active: QueueSession[];
}

class SupportRequestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function supportRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new SupportRequestError("Your sign-in session could not be confirmed. Please sign in again.");

  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const message = typeof record.message === "string"
      ? record.message
      : typeof record.error === "string"
        ? record.error
        : `Support chat could not complete the request (HTTP ${response.status}).`;
    throw new SupportRequestError(message, response.status);
  }
  return payload as T;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function StatusMark({ status }: { status: SupportStatus }) {
  const labels: Record<SupportStatus, string> = {
    waiting: "Waiting for an agent",
    active: "Agent connected",
    ai: "General questions",
    closed: "Conversation closed",
  };
  return (
    <span
      data-testid="support-chat-status"
      className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wide text-[#d8e8e9]"
    >
      <span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-emerald-400" : status === "waiting" ? "bg-amber-300" : "bg-[#7bc5c3]"}`} />
      {labels[status]}
    </span>
  );
}

export function SupportChatWidget() {
  const { user, role, loading: authLoading } = useAuth();
  const isAgent = role === "agent";
  const canChat = role === "client" || role === "vendor";
  const canUseWidget = !authLoading && !!user && (isAgent || canChat);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SupportSession | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueEnvelope>({ waiting: [], active: [] });
  const [selectedAgentSession, setSelectedAgentSession] = useState<SupportSession | null>(null);
  const [availability, setAvailability] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const messageEndRef = useRef<HTMLDivElement>(null);
  const selectedAgentSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedAgentSessionIdRef.current = selectedAgentSession?.id ?? null;
  }, [selectedAgentSession?.id]);

  const loadCustomerConversation = useCallback(async () => {
    const result = await supportRequest<{ session: SupportSession | null; messages: SupportMessage[] }>("/api/support-chat/me");
    if (!result.session) {
      setSession(null);
      setMessages([]);
      setAgentName(null);
      return;
    }
    setSession(result.session);
    setMessages(result.messages ?? []);
    if (result.session.status === "active" && result.session.agent_id) {
      const detail = await supportRequest<ConversationEnvelope & { agentName: string | null }>(`/api/support-chat/${encodeURIComponent(result.session.id)}`);
      setSession(detail.session);
      setMessages(detail.messages ?? []);
      setAgentName(detail.agentName);
    } else {
      setAgentName(null);
    }
  }, []);

  const loadAgentQueue = useCallback(async () => {
    const [presence, nextQueue] = await Promise.all([
      supportRequest<{ available: boolean }>("/api/support-chat/presence"),
      supportRequest<QueueEnvelope>("/api/support-chat/queue"),
    ]);
    setAvailability(presence.available);
    const active = (nextQueue.active ?? []).filter((item) => item.agent_id === user?.id);
    setQueue({
      waiting: nextQueue.waiting ?? [],
      active,
    });
    const selectedId = selectedAgentSessionIdRef.current;
    if (selectedId && !active.some((item) => item.id === selectedId)) {
      setSelectedAgentSession(null);
      setMessages([]);
      setAgentName(null);
    }
  }, [user?.id]);

  const loadAgentConversation = useCallback(async (conversationId: string) => {
    const detail = await supportRequest<ConversationEnvelope & { agentName: string | null }>(
      `/api/support-chat/${encodeURIComponent(conversationId)}`,
    );
    setSelectedAgentSession(detail.session);
    setMessages(detail.messages ?? []);
    setAgentName(detail.agentName);
  }, []);

  useEffect(() => {
    if (!canUseWidget || (!open && !isAgent)) return;
    let alive = true;
    const load = async () => {
      try {
        if (isAgent) await loadAgentQueue();
        else await loadCustomerConversation();
        if (alive) setError(null);
      } catch (requestError) {
        if (alive) setError(requestError instanceof Error ? requestError.message : "Support chat could not be loaded.");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      if (!alive || (!open && !isAgent)) return;
      void (async () => {
        try {
          if (isAgent) await loadAgentQueue();
          else await loadCustomerConversation();
          if (alive) setError(null);
        } catch (requestError) {
          if (alive) setError(requestError instanceof Error ? requestError.message : "Support chat could not be refreshed.");
        }
      })();
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [open, canUseWidget, isAgent, loadAgentQueue, loadCustomerConversation]);

  useEffect(() => {
    if (!canUseWidget || !isAgent || !availability) return;
    let alive = true;
    const heartbeat = async () => {
      try {
        await supportRequest<{ ok: true; available: boolean }>("/api/support-chat/presence", "POST", { available: true });
      } catch (requestError) {
        if (alive) setError(requestError instanceof Error ? requestError.message : "Your online status could not be refreshed.");
      }
    };
    void heartbeat();
    const interval = window.setInterval(() => void heartbeat(), 20_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [availability, canUseWidget, isAgent]);

  useEffect(() => {
    if (!open || !isAgent || !selectedAgentSession?.id) return;
    let alive = true;
    const refresh = async () => {
      try {
        await loadAgentConversation(selectedAgentSession.id);
        if (alive) setError(null);
      } catch (requestError) {
        if (!alive) return;
        if (requestError instanceof SupportRequestError && [403, 404].includes(requestError.status ?? 0)) {
          setSelectedAgentSession(null);
          setMessages([]);
          setAgentName(null);
          setError("This conversation is no longer assigned to you. It has returned to the support queue.");
          try { await loadAgentQueue(); } catch { /* Keep the assignment notice visible. */ }
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "This conversation could not be refreshed.");
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    return () => { alive = false; window.clearInterval(interval); };
  }, [open, isAgent, selectedAgentSession?.id, loadAgentConversation, loadAgentQueue]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const activeSession = isAgent ? selectedAgentSession : session;
  const chatMessages = useMemo(() => [...messages].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  ), [messages]);
  const canSend = !!activeSession && !sending && (
    isAgent
      ? activeSession.status === "active" && activeSession.agent_id === user?.id
      : activeSession.status !== "closed"
  );
  const canRequestHuman = !isAgent && session?.status === "ai" && !actionLoading;

  const applyConversationResult = (result: ConversationEnvelope) => {
    if (isAgent) setSelectedAgentSession(result.session);
    else setSession(result.session);
    setMessages(result.messages ?? []);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
      setError(null);
    }
  };

  const openConversation = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await supportRequest<ConversationEnvelope>("/api/support-chat/open", "POST");
      applyConversationResult(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A support conversation could not be started.");
    } finally {
      setActionLoading(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeSession || !canSend) return;
    setSending(true);
    setError(null);
    try {
      const result = await supportRequest<ConversationEnvelope>(
        `/api/support-chat/${encodeURIComponent(activeSession.id)}/messages`,
        "POST",
        { body },
      );
      applyConversationResult(result);
      setDraft("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const requestHuman = async () => {
    if (!session || !canRequestHuman) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await supportRequest<ConversationEnvelope>(
        `/api/support-chat/${encodeURIComponent(session.id)}/request-human`,
        "POST",
      );
      applyConversationResult(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "A human agent could not be requested.");
    } finally {
      setActionLoading(false);
    }
  };

  const setAgentAvailability = async (available: boolean) => {
    setPresenceSaving(true);
    setError(null);
    try {
      const result = await supportRequest<{ ok: true; available: boolean }>("/api/support-chat/presence", "POST", { available });
      setAvailability(result.available);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Availability could not be updated.");
    } finally {
      setPresenceSaving(false);
    }
  };

  const acceptConversation = async (conversation: QueueSession) => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await supportRequest<ConversationEnvelope>(
        `/api/support-chat/${encodeURIComponent(conversation.id)}/accept`,
        "POST",
      );
      setSelectedAgentSession(result.session);
      setMessages(result.messages ?? []);
      await loadAgentQueue();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "This request could not be accepted.");
      try { await loadAgentQueue(); } catch { /* Keep the original request error visible. */ }
    } finally {
      setActionLoading(false);
    }
  };

  if (!canUseWidget) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <div className="fixed z-[90] right-4 bottom-4 sm:right-6 sm:bottom-6" data-testid="support-chat-widget">
        <DialogContent
          className="fixed left-0 top-auto bottom-0 z-[91] flex h-[min(680px,100dvh)] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-[24px] border border-[#d7e2e1] bg-[#f5f8f7] p-0 text-[#19343a] shadow-[0_20px_70px_rgba(13,38,43,.24)] sm:left-auto sm:right-6 sm:bottom-24 sm:h-[min(660px,calc(100dvh-7rem))] sm:w-[390px] sm:max-w-[calc(100vw-3rem)] sm:rounded-[22px] [&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:text-white/75 [&>button:last-child]:hover:text-white"
          data-testid="support-chat-panel"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{isAgent ? "Support desk" : "Virtual Bank support chat"}</DialogTitle>
          </DialogHeader>
          <header className="relative shrink-0 bg-[#173b41] px-5 pb-4 pt-5 text-[#f5fbf9]">
            <div className="absolute right-0 top-0 h-24 w-28 rounded-bl-[70px] bg-[#24545a] opacity-60" aria-hidden />
            <div className="relative flex items-start gap-3">
              {isAgent && selectedAgentSession && (
                <button
                  type="button"
                  onClick={() => { setSelectedAgentSession(null); setMessages([]); setAgentName(null); setError(null); }}
                  className="mt-1 rounded-lg p-1.5 text-white/75 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c6a65d]"
                  aria-label="Back to support requests"
                  data-testid="support-agent-back"
                ><ArrowLeft size={18} /></button>
              )}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/15 bg-white/10">
                {isAgent ? <Headset size={19} /> : <ShieldCheck size={19} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[16px] font-semibold tracking-[-.02em]">{isAgent ? "Support desk" : "Virtual Bank support"}</h2>
                <p className="mt-0.5 text-xs text-[#c4d7d5]">
                  {isAgent && selectedAgentSession
                  ? (queue.waiting.find((item) => item.id === selectedAgentSession.id)?.display_name ||
                    queue.active.find((item) => item.id === selectedAgentSession.id)?.display_name || "Customer conversation")
                    : isAgent ? "Customer care queue" : "Here when you need us"}
                </p>
                {!isAgent && session && <div className="mt-2"><StatusMark status={session.status} /></div>}
                {isAgent && selectedAgentSession && <div className="mt-2"><StatusMark status={selectedAgentSession.status} /></div>}
              </div>
            </div>
          </header>

          {loading ? (
            <div className="flex-1 space-y-4 overflow-hidden p-5" aria-label="Loading support chat" data-testid="support-chat-loading">
              <div className="h-14 w-4/5 animate-pulse rounded-2xl bg-[#e3ecea]" />
              <div className="ml-auto h-12 w-3/5 animate-pulse rounded-2xl bg-[#d7e8e4]" />
              <div className="h-20 w-5/6 animate-pulse rounded-2xl bg-[#e3ecea]" />
            </div>
          ) : (
            <>
              {isAgent && !selectedAgentSession ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-3 border-b border-[#dce6e4] px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold text-[#28474c]">Taking new requests</p>
                      <p className="mt-0.5 text-[11px] text-[#6a8182]">{availability ? "You are available to customers" : "You will not receive new requests"}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={availability}
                      disabled={presenceSaving}
                      onClick={() => void setAgentAvailability(!availability)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59] focus-visible:ring-offset-2 disabled:opacity-60 ${availability ? "bg-[#28716d]" : "bg-[#aebfbd]"}`}
                      data-testid="support-agent-availability"
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${availability ? "translate-x-6" : "translate-x-1"}`} />
                      <span className="sr-only">{availability ? "Available" : "Unavailable"}</span>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[11px] font-bold uppercase tracking-[.12em] text-[#738988]">Waiting requests</h3>
                      <span className="rounded-full bg-[#e6eeec] px-2 py-0.5 text-[10px] font-semibold text-[#43615f]" data-testid="support-queue-count">{queue.waiting.length}</span>
                    </div>
                    {queue.waiting.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#cbd9d6] bg-white/60 px-4 py-7 text-center" data-testid="support-queue-empty">
                        <Clock3 className="mx-auto mb-2 text-[#819b98]" size={21} />
                        <p className="text-sm font-semibold text-[#355256]">No one is waiting</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#758987]">New customer requests will appear here while you are available.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {queue.waiting.map((request) => (
                          <div key={request.id} className="rounded-2xl border border-[#d9e4e1] bg-white px-3.5 py-3 shadow-[0_2px_8px_rgba(25,52,58,.035)]" data-testid={`support-queue-item-${request.id}`}>
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e7f0ed] text-[#356662]"><UserRound size={17} /></span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{request.display_name || "Customer"}</p>
                                <p className="mt-0.5 text-[11px] text-[#728684]">Waiting for an agent</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void acceptConversation(request)}
                                 disabled={actionLoading || !availability}
                                className="rounded-xl bg-[#1f5c59] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#174c49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59] focus-visible:ring-offset-2 disabled:opacity-50"
                                data-testid={`support-accept-${request.id}`}
                              >Accept</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {queue.active.length > 0 && (
                      <div className="mt-6">
                        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#738988]">Your active chats</h3>
                        <div className="space-y-2">
                          {queue.active.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => { setSelectedAgentSession(item); setMessages([]); void loadAgentConversation(item.id).catch((failure) => setError(failure instanceof Error ? failure.message : "Conversation could not be loaded.")); }}
                              className="flex w-full items-center gap-3 rounded-2xl border border-[#d9e4e1] bg-white px-3.5 py-3 text-left transition hover:border-[#9dbdb6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59]"
                              data-testid={`support-active-${item.id}`}
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f0ed] text-[#356662]"><UserRound size={17} /></span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{item.display_name || "Customer"}</span>
                                <span className="block text-[11px] text-[#728684]">Active conversation</span>
                              </span>
                              <ArrowLeft className="rotate-180 text-[#839895]" size={16} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeSession ? (
                <>
                  <div className="flex items-center gap-2 border-b border-[#e0e9e7] bg-[#edf3f1] px-4 py-2.5">
                    <span className="text-[11px] font-medium text-[#617a78]">{isAgent ? "Customer" : "Conversation with"}</span>
                    <span className="truncate text-xs font-semibold text-[#315b58]">{isAgent ? "Customer" : agentName || (activeSession.agent_id ? "Support agent" : "Virtual Bank assistant")}</span>
                    {activeSession.status === "active" && (
                      <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#34716c]" data-testid="support-agent-ready">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Human agent ready
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    {activeSession.status === "waiting" && !isAgent && (
                      <div className="mb-4 rounded-2xl border border-[#e7d7ad] bg-[#fcf7e9] p-3.5" data-testid="support-waiting-explainer">
                        <p className="text-xs font-semibold text-[#715a22]">Your message is in the support queue</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#7e704c]">A support agent will join this conversation as soon as one is available. You can leave this window open; it refreshes automatically.</p>
                      </div>
                    )}
                    {activeSession.status === "active" && !isAgent && (
                      <div className="mb-4 rounded-2xl border border-[#c8dfd9] bg-[#eaf4f0] p-3" data-testid="support-human-ready-explainer">
                        <p className="text-xs font-semibold text-[#2c645e]">{agentName ? `${agentName} is ready to help` : "A human agent is ready to help"}</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#557772]">You are chatting with a Virtual Bank support agent.</p>
                      </div>
                    )}
                    {activeSession.status === "ai" && !isAgent && (
                      <div className="mb-4 rounded-2xl border border-[#c9ddda] bg-[#e9f2f0] p-3.5" data-testid="support-ai-limit">
                        <div className="flex items-center gap-2 text-[#32615d]"><Bot size={15} /><p className="text-xs font-semibold">Virtual Bank assistant</p></div>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#526e6b]">The assistant answers general questions only. It cannot access or change your account, balances, cards, or transactions. Never send a PIN, password, or verification code.</p>
                        <button
                          type="button"
                          onClick={() => void requestHuman()}
                          disabled={!canRequestHuman}
                          className="mt-3 rounded-xl border border-[#9dbfba] bg-white px-3 py-2 text-xs font-semibold text-[#285e59] transition hover:bg-[#f4faf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59] disabled:opacity-50"
                          data-testid="support-request-human"
                        >{actionLoading ? "Requesting…" : "Request a human agent"}</button>
                      </div>
                    )}
                    {chatMessages.length === 0 && (
                      <div className="py-8 text-center" data-testid="support-message-empty">
                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e4eeeb] text-[#57817c]"><MessageCircle size={19} /></div>
                        <p className="text-sm font-semibold text-[#36565a]">A clear start</p>
                        <p className="mt-1 text-xs text-[#768987]">Your messages will appear here.</p>
                      </div>
                    )}
                    <div className="space-y-3">
                      {chatMessages.map((message) => {
                        const mine = message.sender_role === "user";
                        const systemMessage = message.sender_role === "system";
                        return (
                          <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`support-message-${message.id}`}>
                            <div className={`max-w-[86%] rounded-[18px] px-3.5 py-2.5 ${systemMessage ? "border border-[#dce6e4] bg-[#eaf0ee] text-[#5a706f]" : mine ? "rounded-br-md bg-[#286b66] text-white" : "rounded-bl-md border border-[#dbe5e2] bg-white text-[#29464b] shadow-[0_2px_8px_rgba(25,52,58,.035)]"}`}>
                              <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.55]">{message.body}</p>
                              <p className={`mt-1.5 text-right text-[10px] ${mine ? "text-white/70" : "text-[#879997]"}`}>{timeLabel(message.created_at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div ref={messageEndRef} />
                  </div>
                  {activeSession.status !== "closed" ? (
                    <form onSubmit={sendMessage} className="shrink-0 border-t border-[#dce6e4] bg-white px-3.5 pb-[max(.875rem,env(safe-area-inset-bottom))] pt-3">
                      <label className="sr-only" htmlFor="support-chat-message">Write a support message</label>
                      <div className="flex items-end gap-2 rounded-2xl border border-[#d5e1de] bg-[#f8faf9] p-1.5 focus-within:border-[#86aaa4] focus-within:ring-2 focus-within:ring-[#80aaa4]/20">
                        <textarea
                          id="support-chat-message"
                          rows={1}
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                          placeholder={activeSession.status === "ai" ? "Ask a general question…" : "Write a message…"}
                          disabled={!canSend}
                          className="max-h-24 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm leading-relaxed text-[#244349] outline-none placeholder:text-[#8ca09e] disabled:cursor-not-allowed disabled:opacity-55"
                          data-testid="support-message-input"
                        />
                        <button
                          type="submit"
                          disabled={!canSend || !draft.trim()}
                          aria-label="Send message"
                          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1f625d] text-white transition hover:bg-[#174d49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#b9c9c6]"
                          data-testid="support-message-send"
                        ><Send size={16} /></button>
                      </div>
                      <p className="mt-1.5 px-1 text-[10px] text-[#829491]">Enter to send · Shift + Enter for a new line</p>
                    </form>
                  ) : (
                    <div className="flex flex-col items-center gap-2 border-t border-[#dce6e4] bg-[#edf3f1] px-4 py-3 text-center" data-testid="support-closed-message">
                      <p className="text-xs text-[#607775]">This conversation is closed.</p>
                      {!isAgent && <button type="button" onClick={() => void openConversation()} disabled={actionLoading} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#285e59] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59] disabled:opacity-50" data-testid="support-chat-reopen">{actionLoading ? "Opening…" : "Start a new conversation"}</button>}
                    </div>
                  )}
                </>
              ) : isAgent ? null : (
                <div className="flex flex-1 flex-col items-center justify-center px-7 py-8 text-center" data-testid="support-chat-empty">
                  <div className="relative mb-5 flex h-[74px] w-[74px] items-center justify-center rounded-[25px] bg-[#e2efeb] text-[#326d67]">
                    <Headset size={30} />
                    <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-[#f5f8f7] bg-[#78a99a]" />
                  </div>
                  <p className="text-[17px] font-semibold tracking-[-.02em] text-[#25464b]">Talk to our support team</p>
                  <p className="mt-2 max-w-[270px] text-[13px] leading-relaxed text-[#718582]">Ask about using Virtual Bank. We will keep your conversation here so you can return to it anytime.</p>
                  <button
                    type="button"
                    onClick={() => void openConversation()}
                    disabled={actionLoading}
                    className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#205f5a] px-5 text-sm font-semibold text-white shadow-[0_5px_14px_rgba(31,95,90,.18)] transition hover:bg-[#174e49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59] focus-visible:ring-offset-2 disabled:opacity-55"
                    data-testid="support-chat-start"
                  ><MessageCircle size={16} />{actionLoading ? "Opening support…" : "Start a conversation"}</button>
                  <p className="mt-4 text-[10px] text-[#8a9a97]">Secure support for your Virtual Bank account</p>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="absolute inset-x-3 top-[88px] z-10 flex items-start gap-3 rounded-xl border border-[#e4c5bc] bg-[#fff4f0] px-3.5 py-3 text-xs text-[#8b4739] shadow-md" role="alert" data-testid="support-chat-error">
              <p className="flex-1 leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (isAgent) {
                    void Promise.all([
                      loadAgentQueue(),
                      selectedAgentSession ? loadAgentConversation(selectedAgentSession.id) : Promise.resolve(),
                    ]).catch((failure) => setError(failure instanceof Error ? failure.message : "Could not refresh."));
                  }
                  else void loadCustomerConversation().catch((failure) => setError(failure instanceof Error ? failure.message : "Could not refresh."));
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b79a59]"
                data-testid="support-chat-retry"
              ><RotateCw size={12} />Retry</button>
            </div>
          )}
        </DialogContent>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "Close Virtual Bank support" : "Open Virtual Bank support"}
            className={`relative flex h-[58px] items-center gap-2.5 rounded-[19px] px-4 text-white shadow-[0_8px_24px_rgba(19,55,59,.24)] transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5a653] focus-visible:ring-offset-2 ${open ? "bg-[#21494d]" : "bg-[#205f5a] hover:bg-[#174e49]"}`}
            data-testid="support-chat-toggle"
          >
            {open ? <X size={20} /> : <MessageCircle size={21} />}
            <span className="text-sm font-semibold">
              {open ? "Close" : isAgent ? "Support inbox" : "Support"}
            </span>
            {!open && isAgent && queue.waiting.length > 0 && (
              <span
                className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#f5f8f7] bg-[#c5a653] px-1 text-[10px] font-bold text-[#19343a]"
                data-testid="support-queue-badge"
                aria-label={`${queue.waiting.length} waiting support requests`}
              >{queue.waiting.length}</span>
            )}
            {!open && !isAgent && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#f5f8f7] bg-[#c5a653]" />}
          </button>
        </DialogTrigger>
      </div>
    </Dialog>
  );
}

export default SupportChatWidget;

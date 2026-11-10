import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Send, CheckCheck, Check } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface MsgPayload {
  sender_id: string;
  recipient_id: string;
  text: string;
  thread_id: string;
  sender_name: string;
}

interface Message {
  id: string;
  payload: MsgPayload;
  is_read: boolean;
  created_at: string;
  is_mine: boolean;
}

interface NotificationRow {
  id: string;
  message: string;
  is_read: boolean;
  created_at: string;
  type: string;
}

interface ChatContact {
  id: string;
  full_name: string | null;
  store_name: string | null;
  role: string;
}

function makeThreadId(a: string, b: string) {
  return [a, b].sort().join("_");
}

function toMessage(row: NotificationRow, threadId: string): Message | null {
  try {
    const payload = JSON.parse(row.message) as MsgPayload;
    if (payload.thread_id !== threadId || typeof payload.text !== "string") return null;
    return {
      id: row.id,
      payload,
      is_read: row.is_read,
      created_at: row.created_at,
      is_mine: row.type === "chat_outbox",
    };
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<string, string> = {
  agent: "Agent",
  vendor: "Vendor",
  client: "Client",
  admin: "Admin",
  founder: "Founder",
};

const ChatThread = () => {
  const navigate = useNavigate();
  const { peerId } = useParams<{ peerId: string }>();
  const { toast } = useToast();

  const [userId, setUserId] = useState("");
  const [peerName, setPeerName] = useState("");
  const [peerRole, setPeerRole] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messageError, setMessageError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchMessages = useCallback(async (uid: string, threadId: string) => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .in("type", ["chat_message", "chat_outbox"])
      .like("message", `%"thread_id":"${threadId}"%`)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const fetched = ((data || []) as NotificationRow[])
      .map(row => toMessage(row, threadId))
      .filter((message): message is Message => message !== null);
    setMessages(previous => {
      const merged = new Map(previous.map(message => [message.id, message]));
      fetched.forEach(message => merged.set(message.id, message));
      return Array.from(merged.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    if (!peerId) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const initialize = async () => {
      setLoading(true);
      setMessageError("");
      setMessages([]);
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;
        if (!user) {
          navigate("/auth");
          return;
        }
        if (!active) return;

        setUserId(user.id);
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
          navigate("/auth");
          return;
        }
        const contactResponse = await fetch(`/api/chat/contact/${encodeURIComponent(peerId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const contactResult = await contactResponse.json().catch(() => ({})) as {
          contact?: ChatContact;
          error?: string;
        };
        if (!contactResponse.ok || !contactResult.contact) {
          throw new Error(contactResult.error || "This message contact could not be loaded.");
        }
        if (!active) return;

        setPeerName(contactResult.contact.store_name || contactResult.contact.full_name || "Unknown");
        setPeerRole(contactResult.contact.role);

        const threadId = makeThreadId(user.id, peerId);
        await fetchMessages(user.id, threadId);
        if (!active) return;
        setLoading(false);

        const { error: readError } = await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", user.id)
          .eq("type", "chat_message")
          .like("message", `%"thread_id":"${threadId}"%`);
        if (readError) {
          setMessageError("Messages loaded, but read status could not be updated.");
        }

        channel = supabase
          .channel(`chat_${threadId}_${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT" as const,
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            payload => {
              const row = payload.new as NotificationRow;
              if (!["chat_message", "chat_outbox"].includes(row.type)) return;
              const message = toMessage(row, threadId);
              if (!message) return;
              setMessages(previous => {
                if (previous.some(existing => existing.id === message.id)) return previous;
                return [...previous, message];
              });
              if (row.type === "chat_message") {
                void supabase
                  .from("notifications")
                  .update({ is_read: true })
                  .eq("id", row.id);
              }
            },
          )
          .subscribe();
      } catch {
        if (active) {
          setMessageError("Messages could not be loaded. Check your connection and try again.");
          setLoading(false);
        }
      }
    };

    void initialize();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [peerId, navigate, fetchMessages]);

  // Re-fetch periodically so messages recover if the realtime connection drops.
  useEffect(() => {
    if (!userId || !peerId) return;
    const threadId = makeThreadId(userId, peerId);
    const timer = window.setInterval(() => {
      void fetchMessages(userId, threadId).catch(() => {
        setMessageError("Could not refresh messages. Check your connection.");
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [userId, peerId, fetchMessages]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || !userId || !peerId || sending) return;
    setSending(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) throw new Error("Your session expired. Please sign in again.");

      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ recipientId: peerId, text: msg }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Message could not be sent.");

      const sentMessage = toMessage(result.message as NotificationRow, makeThreadId(userId, peerId));
      if (!sentMessage) throw new Error("The message was sent, but could not be displayed.");
      setMessages(previous => {
        if (previous.some(existing => existing.id === sentMessage.id)) return previous;
        return [...previous, sentMessage];
      });
      setText("");
      setMessageError("");
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
    finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // Group by date
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const m of messages) {
    const d = format(new Date(m.created_at), "MMMM d, yyyy");
    const last = grouped[grouped.length - 1];
    if (last?.date === d) last.msgs.push(m);
    else grouped.push({ date: d, msgs: [m] });
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-3 border-b bg-background sticky top-0 z-10 shrink-0">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/chat")}>
          <ArrowLeft size={20} />
        </Button>
        <Avatar className="w-9 h-9 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
            {(peerName || "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate leading-tight">{peerName || "Loading…"}</p>
          {peerRole && (
            <p className="text-xs text-muted-foreground leading-tight">{ROLE_LABEL[peerRole] || peerRole}</p>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messageError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-xs text-destructive" role="alert">
            {messageError}
          </div>
        )}
        {loading && (
          <div className="text-center text-sm text-muted-foreground py-12">Loading messages…</div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {(peerName || "?").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-base">{peerName}</p>
              {peerRole && <p className="text-xs text-muted-foreground mb-2">{ROLE_LABEL[peerRole] || peerRole}</p>}
              <p className="text-sm text-muted-foreground">Say hello to start the conversation!</p>
            </div>
          </div>
        )}

        {grouped.map(group => (
          <div key={group.date}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground bg-muted px-2.5 py-1 rounded-full whitespace-nowrap">
                {group.date}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="space-y-1.5">
              {group.msgs.map((m, i) => {
                const prevMine = i > 0 ? group.msgs[i - 1].is_mine : null;
                const showAvatar = !m.is_mine && prevMine !== false;
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${m.is_mine ? "justify-end" : "justify-start"}`}>
                    {!m.is_mine && (
                      <div className="w-6 h-6 shrink-0">
                        {showAvatar && (
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                              {peerName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}
                    <div className={`max-w-[75%] flex flex-col ${m.is_mine ? "items-end" : "items-start"}`}>
                      <div
                        className={`px-3.5 py-2 text-sm leading-relaxed break-words ${
                          m.is_mine
                            ? "bg-primary text-primary-foreground rounded-t-2xl rounded-bl-2xl rounded-br-sm"
                            : "bg-muted text-foreground rounded-t-2xl rounded-br-2xl rounded-bl-sm"
                        }`}
                      >
                        {m.payload.text}
                      </div>
                      <div className={`flex items-center gap-0.5 mt-0.5 px-1 ${m.is_mine ? "flex-row-reverse" : "flex-row"}`}>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(m.created_at), "HH:mm")}
                        </span>
                        {m.is_mine && (
                          <span className="text-muted-foreground ml-0.5">
                            {m.is_read
                              ? <CheckCheck size={11} className="text-primary" />
                              : <Check size={11} />
                            }
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t bg-background px-3 py-2.5 flex items-center gap-2 shrink-0">
        <Input
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 rounded-full bg-muted border-0 focus-visible:ring-1 text-sm h-10"
          disabled={sending}
          autoComplete="off"
        />
        <Button
          size="icon"
          onClick={send}
          disabled={!text.trim() || sending}
          className="rounded-full w-10 h-10 shrink-0"
        >
          <Send size={15} />
        </Button>
      </div>
    </div>
  );
};

export default ChatThread;

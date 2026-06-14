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

function makeThreadId(a: string, b: string) {
  return [a, b].sort().join("_");
}

const ROLE_LABEL: Record<string, string> = {
  agent: "Agent",
  vendor: "Vendor",
  client: "Client",
  admin: "Admin",
};

const ChatThread = () => {
  const navigate = useNavigate();
  const { peerId } = useParams<{ peerId: string }>();
  const { toast } = useToast();

  const [userId, setUserId] = useState("");
  const [myName, setMyName] = useState("Me");
  const [peerName, setPeerName] = useState("");
  const [peerRole, setPeerRole] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const uidRef = useRef("");
  const peerNameRef = useRef("");

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!peerId) return;
    init();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [peerId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }
    setUserId(user.id);
    uidRef.current = user.id;

    const [myProfileRes, peerProfileRes, peerRoleRes] = await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      supabase.from("profiles").select("full_name, store_name").eq("id", peerId!).single(),
      supabase.from("user_roles").select("role").eq("user_id", peerId!).single(),
    ]);

    const name = (myProfileRes.data as any)?.full_name || "Me";
    setMyName(name);

    const pn = (peerProfileRes.data as any)?.store_name || (peerProfileRes.data as any)?.full_name || "Unknown";
    setPeerName(pn);
    peerNameRef.current = pn;
    setPeerRole((peerRoleRes.data as any)?.role || "");

    const tid = makeThreadId(user.id, peerId!);
    await fetchMessages(user.id, tid);
    setLoading(false);

    // Mark incoming messages as read
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("type", "chat_message")
      .like("message", `%"sender_id":"${peerId!}"%`);

    // Realtime subscription
    const ch = supabase
      .channel(`chat_${tid}_${user.id}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!["chat_message", "chat_outbox"].includes(row.type)) return;
          let p: MsgPayload | null = null;
          try { p = JSON.parse(row.message); } catch { return; }
          if (!p || p.thread_id !== tid) return;
          const isMine = row.type === "chat_outbox";
          const newMsg: Message = {
            id: row.id,
            payload: p,
            is_read: row.is_read,
            created_at: row.created_at,
            is_mine: isMine,
          };
          setMessages(prev => {
            if (prev.find(m => m.id === row.id)) return prev;
            return [...prev, newMsg];
          });
          if (!isMine) {
            supabase.from("notifications").update({ is_read: true }).eq("id", row.id).then(() => {});
          }
        }
      )
      .subscribe();
    channelRef.current = ch;
  };

  const fetchMessages = async (uid: string, tid: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .in("type", ["chat_message", "chat_outbox"])
      .order("created_at", { ascending: true });

    if (!data) return;

    const msgs: Message[] = [];
    for (const row of data as any[]) {
      let p: MsgPayload | null = null;
      try { p = JSON.parse(row.message); } catch { continue; }
      if (!p || p.thread_id !== tid) continue;
      msgs.push({
        id: row.id,
        payload: p,
        is_read: row.is_read,
        created_at: row.created_at,
        is_mine: row.type === "chat_outbox",
      });
    }
    setMessages(msgs);
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || !userId || !peerId || sending) return;
    setSending(true);
    setText("");

    const tid = makeThreadId(userId, peerId);
    const payload: MsgPayload = {
      sender_id: userId,
      recipient_id: peerId,
      text: msg,
      thread_id: tid,
      sender_name: myName,
    };
    const payloadStr = JSON.stringify(payload);

    const [res1, res2] = await Promise.all([
      // Deliver to recipient
      supabase.from("notifications").insert({
        user_id: peerId,
        type: "chat_message",
        title: myName,
        message: payloadStr,
        is_read: false,
      }),
      // Copy in sender outbox
      supabase.from("notifications").insert({
        user_id: userId,
        type: "chat_outbox",
        title: peerNameRef.current || peerName,
        message: payloadStr,
        is_read: true,
      }),
    ]);

    if (res1.error || res2.error) {
      toast({ title: "Failed to send message", description: "Please try again.", variant: "destructive" });
      setText(msg);
    }
    setSending(false);
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

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, MessageSquare, Search, Plus, Users } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";

interface MsgPayload {
  sender_id: string;
  recipient_id: string;
  text: string;
  thread_id: string;
  sender_name: string;
}

interface Thread {
  thread_id: string;
  peer_id: string;
  peer_name: string;
  last_message: string;
  last_ts: string;
  unread: number;
}

interface PeerProfile {
  id: string;
  full_name: string | null;
  store_name: string | null;
  role?: string;
}

function formatTs(ts: string) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "dd/MM/yy");
}

const ChatInbox = () => {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [peers, setPeers] = useState<PeerProfile[]>([]);
  const [showPeers, setShowPeers] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    const myRole = (roleData as any)?.role ?? "client";

    await Promise.all([
      fetchThreads(user.id),
      fetchPeers(user.id, myRole),
    ]);
    setLoading(false);
  };

  const fetchThreads = async (uid: string) => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .in("type", ["chat_message", "chat_outbox"])
      .order("created_at", { ascending: false });

    if (!data) return;

    const threadMap = new Map<string, Thread>();
    for (const row of data as any[]) {
      let payload: MsgPayload | null = null;
      try { payload = JSON.parse(row.message); } catch { continue; }
      if (!payload?.thread_id) continue;

      const isMine = row.type === "chat_outbox";
      const peerId = isMine ? payload.recipient_id : payload.sender_id;
      const peerName = isMine ? row.title : (payload.sender_name || row.title);
      const tid = payload.thread_id;

      if (!threadMap.has(tid)) {
        threadMap.set(tid, {
          thread_id: tid,
          peer_id: peerId,
          peer_name: peerName,
          last_message: (isMine ? "You: " : "") + payload.text,
          last_ts: row.created_at,
          unread: (!isMine && !row.is_read) ? 1 : 0,
        });
      } else {
        const t = threadMap.get(tid)!;
        if (!isMine && !row.is_read) t.unread++;
      }
    }

    setThreads(Array.from(threadMap.values()));
  };

  const fetchPeers = async (uid: string, myRole: string) => {
    const peerList: PeerProfile[] = [];

    if (myRole === "client") {
      const { data: myProfile } = await supabase
        .from("profiles")
        .select("agent_id")
        .eq("id", uid)
        .single();

      const agentId = (myProfile as any)?.agent_id;
      if (agentId) {
        const { data: agentProfile } = await supabase
          .from("profiles")
          .select("id, full_name, store_name")
          .eq("id", agentId)
          .single();
        if (agentProfile) peerList.push({ ...(agentProfile as any), role: "agent" });
      }

      const { data: vendorRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "vendor")
        .limit(30);
      if (vendorRoles?.length) {
        const ids = (vendorRoles as any[]).map(r => r.user_id);
        const { data: vendorProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, store_name")
          .in("id", ids);
        if (vendorProfiles) {
          (vendorProfiles as any[]).forEach(p => peerList.push({ ...p, role: "vendor" }));
        }
      }
    } else if (myRole === "agent") {
      const { data: clients } = await supabase
        .from("profiles")
        .select("id, full_name, store_name")
        .eq("agent_id", uid)
        .limit(50);
      if (clients) (clients as any[]).forEach(c => peerList.push({ ...c, role: "client" }));
    } else if (myRole === "vendor" || myRole === "admin") {
      const { data: agentRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agent")
        .limit(10);
      if (agentRoles?.length) {
        const ids = (agentRoles as any[]).map(r => r.user_id);
        const { data: agentProfiles } = await supabase
          .from("profiles")
          .select("id, full_name, store_name")
          .in("id", ids);
        if (agentProfiles) (agentProfiles as any[]).forEach(p => peerList.push({ ...p, role: "agent" }));
      }
    }

    setPeers(peerList);
  };

  const filteredThreads = threads.filter(t =>
    t.peer_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredPeers = peers.filter(p =>
    ((p.store_name || p.full_name) ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = threads.reduce((n, t) => n + t.unread, 0);

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </Button>
          <h1 className="text-xl font-bold flex-1">
            Messages
            {totalUnread > 0 && (
              <Badge className="ml-2 h-5 px-1.5 text-xs bg-primary text-primary-foreground">{totalUnread}</Badge>
            )}
          </h1>
          <Button variant="ghost" size="icon" onClick={() => setShowPeers(!showPeers)} title="New conversation">
            <Plus size={20} />
          </Button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* New conversation panel */}
      {showPeers && (
        <div className="border-b bg-muted/30 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <Users size={12} /> Start new conversation
          </p>
          {filteredPeers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">No contacts available.</p>
          ) : (
            <div className="space-y-1">
              {filteredPeers.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setShowPeers(false); navigate(`/chat/${p.id}`); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
                      {((p.store_name || p.full_name) ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{p.store_name || p.full_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            Loading…
          </div>
        )}

        {!loading && filteredThreads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <MessageSquare size={28} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">No messages yet</h3>
              <p className="text-sm text-muted-foreground">
                Tap the <strong>+</strong> button above to start a conversation with your agent or a vendor.
              </p>
            </div>
          </div>
        )}

        {filteredThreads.map(thread => (
          <button
            key={thread.thread_id}
            onClick={() => navigate(`/chat/${thread.peer_id}`)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 border-b transition-colors"
          >
            <div className="relative shrink-0">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-base">
                  {thread.peer_name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {thread.unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full border-2 border-background" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between">
                <p className={`text-sm truncate ${thread.unread > 0 ? "font-bold" : "font-medium"}`}>
                  {thread.peer_name}
                </p>
                <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                  {formatTs(thread.last_ts)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className={`text-xs truncate ${thread.unread > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {thread.last_message}
                </p>
                {thread.unread > 0 && (
                  <Badge className="h-5 min-w-5 px-1 text-[10px] rounded-full bg-primary text-primary-foreground shrink-0">
                    {thread.unread > 9 ? "9+" : thread.unread}
                  </Badge>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ChatInbox;

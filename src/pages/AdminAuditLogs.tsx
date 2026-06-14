import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, FileText, Trash2, RefreshCw, Download,
  MessageSquare, ShieldAlert, Filter, CheckSquare, Square,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const AGE_OPTIONS = [
  { label: "Older than 7 days",  days: 7   },
  { label: "Older than 30 days", days: 30  },
  { label: "Older than 90 days", days: 90  },
  { label: "All logs",           days: 0   },
];

const BADGE_COLORS: Record<string, string> = {
  session: "bg-blue-100 text-blue-800",
  chat: "bg-purple-100 text-purple-800",
  transaction: "bg-green-100 text-green-800",
  security: "bg-red-100 text-red-800",
  admin: "bg-orange-100 text-orange-800",
};

function actionCategory(action: string) {
  if (action.startsWith("session.")) return "session";
  if (action.startsWith("chat")) return "chat";
  if (action.includes("transaction") || action.includes("transfer")) return "transaction";
  if (action.includes("security") || action.includes("login") || action.includes("otp") || action.includes("pin")) return "security";
  if (action.includes("admin") || action.includes("user") || action.includes("kyc")) return "admin";
  return "other";
}

const AdminAuditLogs = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteAge, setDeleteAge] = useState("30");
  const [totalCount, setTotalCount] = useState(0);
  const [chatMsgCount, setChatMsgCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const [logsRes, countRes, chatRes] = await Promise.all([
      supabase
        .from("audit_logs" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("audit_logs" as never)
        .select("id", { count: "exact", head: true }),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .in("type", ["chat_message", "chat_outbox"]),
    ]);
    setLogs((logsRes.data as AuditLog[]) || []);
    setTotalCount((countRes as any).count ?? 0);
    setChatMsgCount((chatRes as any).count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = logs.filter(l => {
    const matchText =
      !filter ||
      l.action.toLowerCase().includes(filter.toLowerCase()) ||
      (l.entity_type ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (l.actor_role ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (l.actor_id ?? "").toLowerCase().includes(filter.toLowerCase());

    const cat = actionCategory(l.action);
    const matchCat = categoryFilter === "all" || cat === categoryFilter;
    return matchText && matchCat;
  });

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(l => l.id)));
  };

  // ── Delete selected rows ─────────────────────────────────────────────────
  const deleteSelected = async () => {
    if (!selected.size) return;
    setDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("audit_logs" as never)
      .delete()
      .in("id", ids);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Deleted ${ids.length} log${ids.length > 1 ? "s" : ""}` });
      await load();
    }
    setDeleting(false);
  };

  // ── Delete by age ────────────────────────────────────────────────────────
  const deleteByAge = async () => {
    setDeleting(true);
    const days = Number(deleteAge);
    let q = supabase.from("audit_logs" as never).delete();
    if (days > 0) {
      const cutoff = subDays(new Date(), days).toISOString();
      q = (q as any).lt("created_at", cutoff);
    } else {
      q = (q as any).neq("id", "00000000-0000-0000-0000-000000000000"); // delete all
    }
    const { error } = await q;
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      const label = days > 0 ? `older than ${days} days` : "all";
      toast({ title: `Deleted audit logs ${label}` });
      await load();
    }
    setDeleting(false);
  };

  // ── Clear chat messages from notifications table ─────────────────────────
  const clearChatMessages = async () => {
    setDeleting(true);
    const { error, count } = await supabase
      .from("notifications")
      .delete()
      .in("type", ["chat_message", "chat_outbox"]);
    if (error) {
      toast({ title: "Clear failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Cleared ${chatMsgCount} chat message${chatMsgCount !== 1 ? "s" : ""} from notifications` });
      await load();
    }
    setDeleting(false);
  };

  // ── Export CSV ───────────────────────────────────────────────────────────
  const exportCsv = () => {
    const rows = [
      ["ID", "Action", "Role", "Actor", "Entity", "IP", "Created At"],
      ...filtered.map(l => [
        l.id,
        l.action,
        l.actor_role ?? "",
        l.actor_id ?? "",
        l.entity_type ?? "",
        l.ip_address ?? "",
        l.created_at,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allFilteredSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2 flex-1">
          <FileText className="h-5 w-5" /> Audit Logs
        </h1>
        <Button variant="ghost" size="icon" onClick={load} className="text-primary-foreground" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={exportCsv} className="text-primary-foreground" title="Export CSV">
          <Download className="h-4 w-4" />
        </Button>
      </header>

      <div className="p-4 space-y-4 max-w-3xl mx-auto">

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-2xl font-bold">{totalCount}</div>
              <div className="text-xs text-muted-foreground">Total logs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-2xl font-bold">{logs.filter(l => actionCategory(l.action) === "session").length}</div>
              <div className="text-xs text-muted-foreground">Session events</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{chatMsgCount}</div>
              <div className="text-xs text-muted-foreground">Chat messages</div>
            </CardContent>
          </Card>
        </div>

        {/* Bulk-delete toolbar */}
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <Trash2 size={15} /> Delete Old Logs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Delete by age */}
            <div className="flex gap-2 items-center flex-wrap">
              <Select value={deleteAge} onValueChange={setDeleteAge}>
                <SelectTrigger className="w-48 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGE_OPTIONS.map(o => (
                    <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={deleting}>
                    <Trash2 size={14} className="mr-1" /> Delete Audit Logs
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete audit logs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {Number(deleteAge) > 0
                        ? `This will permanently delete all audit logs older than ${deleteAge} days. This cannot be undone.`
                        : "This will permanently delete ALL audit logs. This cannot be undone."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteByAge} className="bg-destructive hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Clear chat messages */}
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <MessageSquare size={13} /> Chat message store:
                <span className="font-semibold text-foreground ml-1">{chatMsgCount} records</span>
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={deleting || chatMsgCount === 0}>
                    <Trash2 size={14} className="mr-1" /> Clear Chat History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all chat messages?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {chatMsgCount} chat messages from the notifications store. Users will lose their chat history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearChatMessages} className="bg-destructive hover:bg-destructive/90">
                      Clear All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search action, role, actor…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              <SelectItem value="session">Session</SelectItem>
              <SelectItem value="security">Security</SelectItem>
              <SelectItem value="transaction">Transaction</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Selection toolbar */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
            <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-medium">
              {allFilteredSelected
                ? <CheckSquare size={16} className="text-primary" />
                : <Square size={16} className="text-muted-foreground" />
              }
              {allFilteredSelected ? "Deselect all" : `Select all (${filtered.length})`}
            </button>
            {selected.size > 0 && (
              <>
                <span className="text-muted-foreground">|</span>
                <span className="text-sm text-primary font-medium">{selected.size} selected</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={deleting}>
                      <Trash2 size={12} className="mr-1" /> Delete selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selected.size} log{selected.size > 1 ? "s" : ""}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the selected audit log{selected.size > 1 ? "s" : ""}. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteSelected} className="bg-destructive hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} shown / {totalCount} total</span>
          </div>
        )}

        {/* Log list */}
        {loading && <p className="text-center text-muted-foreground py-8">Loading…</p>}

        {!loading && filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <ShieldAlert size={32} className="mx-auto mb-2 opacity-40" />
            No logs found.
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(l => {
            const cat = actionCategory(l.action);
            const isSelected = selected.has(l.id);
            return (
              <Card
                key={l.id}
                className={`transition-colors cursor-pointer ${isSelected ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}
                onClick={() => toggleOne(l.id)}
              >
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(l.id)}
                      className="mt-0.5 shrink-0"
                      onClick={e => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-[10px] px-1.5 py-0 ${BADGE_COLORS[cat] ?? "bg-muted text-muted-foreground"}`}>
                          {l.action}
                        </Badge>
                        {l.actor_role && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{l.actor_role}</Badge>
                        )}
                        {l.entity_type && (
                          <span className="text-[10px] text-muted-foreground">{l.entity_type}</span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(l.created_at), "dd/MM/yy HH:mm")}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {l.actor_id && <div>By: <span className="font-mono">{l.actor_id.slice(0, 12)}…</span></div>}
                        {l.ip_address && <div>IP: {l.ip_address}</div>}
                        {Object.keys(l.metadata || {}).length > 0 && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-primary text-[10px]">Show metadata</summary>
                            <pre className="bg-muted p-2 rounded text-[10px] overflow-x-auto mt-1">
                              {JSON.stringify(l.metadata, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AdminAuditLogs;

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Download, RefreshCw, Filter } from "lucide-react";
import { format } from "date-fns";

interface BootReport {
  id: string;
  stage: string;
  reason: string | null;
  message: string | null;
  attempts: number;
  online: boolean | null;
  user_agent: string | null;
  app_url: string | null;
  user_id: string | null;
  created_at: string;
}

const RANGES = [
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
  { label: "All time", hours: 0 },
];

const STAGES = ["all", "network", "initSupabase", "auth", "bundle"];

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const AdminBootErrors = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BootReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeHours, setRangeHours] = useState(24 * 7);
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [minAttempts, setMinAttempts] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("boot_error_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (rangeHours > 0) {
      q = q.gte("created_at", new Date(Date.now() - rangeHours * 3600_000).toISOString());
    }
    if (stage !== "all") q = q.eq("stage", stage);
    const { data, error } = await q;
    if (error) toast.error(`Could not load reports: ${error.message}`);
    setRows((data as BootReport[]) ?? []);
    setLoading(false);
  }, [rangeHours, stage]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const min = parseInt(minAttempts, 10) || 0;
    return rows.filter((r) => {
      if (r.attempts < min) return false;
      if (!term) return true;
      return [r.reason, r.message, r.stage, r.user_agent, r.app_url]
        .some((f) => (f ?? "").toLowerCase().includes(term));
    });
  }, [rows, search, minAttempts]);

  const byReason = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach((r) => {
      const key = r.reason || r.message || r.stage;
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filtered]);

  const exportCsv = () => {
    if (filtered.length === 0) { toast.error("Nothing to export"); return; }
    const header = ["date", "stage", "reason", "message", "attempts", "online", "user_id", "app_url", "user_agent"];
    const lines = [
      header.join(","),
      ...filtered.map((r) => [
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
        r.stage, r.reason, r.message, r.attempts,
        r.online === null ? "" : r.online ? "online" : "offline",
        r.user_id, r.app_url, r.user_agent,
      ].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boot-error-reports-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} report(s)`);
  };

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back">
          <ArrowLeft size={20} />
        </Button>
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-destructive" />
          <h1 className="font-bold text-foreground">Boot Error Reports</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
          <Button size="sm" onClick={exportCsv}>
            <Download size={16} className="mr-1" /> CSV
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter size={15} /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Select value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Date range" /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => (
                  <SelectItem key={r.hours} value={String(r.hours)}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue placeholder="Failure stage" /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All stages" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search reason / message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Input
              type="number"
              min={0}
              placeholder="Min attempts"
              value={minAttempts}
              onChange={(e) => setMinAttempts(e.target.value)}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
            <p className="text-[11px] text-muted-foreground">reports</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {new Set(filtered.map((r) => r.user_id ?? r.user_agent)).size}
            </p>
            <p className="text-[11px] text-muted-foreground">distinct devices</p>
          </CardContent></Card>
          <Card><CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">
              {filtered.reduce((s, r) => s + (r.attempts || 0), 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">total retries</p>
          </CardContent></Card>
        </div>

        {byReason.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top failure reasons</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {byReason.map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-foreground break-words">{reason}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No boot errors for these filters.</p>
          )}
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">{r.stage}</Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss")}
                  </span>
                </div>
                <p className="text-sm text-foreground break-words">{r.reason || r.message || "—"}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground font-mono">
                  <span>attempts: {r.attempts}</span>
                  <span>{r.online ? "online" : "offline"}</span>
                  {r.user_id && <span>user: {r.user_id.slice(0, 8)}…</span>}
                </div>
                {r.user_agent && (
                  <p className="text-[10px] text-muted-foreground break-all">{r.user_agent}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminBootErrors;

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Brain,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Power,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import {
  AISecuritySettings,
  DEFAULT_AI_SETTINGS,
  RiskLevel,
  ScoredTransaction,
  loadAISettings,
  saveAISettings,
  scoreTransactions,
  summarizeRisk,
} from "@/lib/aiSecurity";

const RISK_COLORS: Record<RiskLevel, string> = {
  low: "bg-green-500/15 text-green-700 dark:text-green-300",
  medium: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  critical: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const AdminAISecurity = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [settings, setSettings] = useState<AISecuritySettings>(DEFAULT_AI_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [scored, setScored] = useState<ScoredTransaction[]>([]);
  const [watchInput, setWatchInput] = useState("");
  const [trustInput, setTrustInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setSettings(loadAISettings());
  }, []);

  const fetchTx = async () => {
    setRefreshing(true);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("transactions")
      .select("id, amount, fee, status, transaction_type, description, created_at, sender_id, receiver_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) {
      setScored(scoreTransactions(data as any, settings));
    }
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    fetchTx();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-score when settings change (without refetching)
  useEffect(() => {
    if (scored.length === 0 && !loading) return;
    if (loading) return;
    setScored((prev) =>
      scoreTransactions(prev as any, settings)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const summary = useMemo(() => summarizeRisk(scored), [scored]);

  const update = (patch: Partial<AISecuritySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAISettings(next);
  };

  const updateThreshold = <K extends keyof AISecuritySettings["thresholds"]>(
    key: K,
    value: AISecuritySettings["thresholds"][K]
  ) => {
    const next = {
      ...settings,
      thresholds: { ...settings.thresholds, [key]: value },
    };
    setSettings(next);
    saveAISettings(next);
  };

  const addToList = (kind: "watchlist" | "trustlist", value: string) => {
    const v = value.trim();
    if (!v) return;
    if (settings[kind].includes(v)) return;
    update({ [kind]: [...settings[kind], v] } as Partial<AISecuritySettings>);
    if (kind === "watchlist") setWatchInput("");
    else setTrustInput("");
  };

  const removeFromList = (kind: "watchlist" | "trustlist", value: string) => {
    update({
      [kind]: settings[kind].filter((x) => x !== value),
    } as Partial<AISecuritySettings>);
  };

  const resetDefaults = () => {
    setSettings(DEFAULT_AI_SETTINGS);
    saveAISettings(DEFAULT_AI_SETTINGS);
    toast({ title: "Defaults restored" });
  };

  const overrideClear = (txId: string) => {
    setScored((prev) => prev.filter((t) => t.id !== txId));
    toast({ title: "Marked as reviewed", description: "Removed from the live alerts list." });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back">
          <ArrowLeft size={20} className="mr-2" /> Back to admin
        </Button>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Brain className="text-primary" />
              AI Security Center
            </h1>
            <p className="text-muted-foreground text-sm">
              Real-time risk scoring of platform transactions. You're in full control.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchTx} disabled={refreshing} className="gap-2" data-testid="button-refresh">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button variant="outline" onClick={resetDefaults} data-testid="button-reset">
              Reset to defaults
            </Button>
          </div>
        </div>

        {/* Master switch */}
        <Card className={`mb-6 border-2 ${settings.enabled ? "border-primary/40" : "border-destructive/40"}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${settings.enabled ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                  <Power size={24} />
                </div>
                <div>
                  <div className="font-bold text-lg">
                    AI security is {settings.enabled ? "ENABLED" : "DISABLED"}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {settings.enabled
                      ? "Transactions are being scored in real time."
                      : "All scoring is paused. Nothing is flagged."}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => update({ enabled: v })}
                className="scale-125"
                data-testid="switch-enabled"
              />
            </div>

            <Separator className="my-4" />

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${settings.autoBlock ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  <ShieldAlert size={18} />
                </div>
                <div>
                  <div className="font-semibold">Auto-block critical transactions</div>
                  <p className="text-xs text-muted-foreground">
                    When on, anything scored "critical" is marked as blocked. You can still override manually.
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.autoBlock}
                disabled={!settings.enabled}
                onCheckedChange={(v) => update({ autoBlock: v })}
                data-testid="switch-autoblock"
              />
            </div>
          </CardContent>
        </Card>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card>
            <CardContent className="pt-5">
              <div className="text-xs text-muted-foreground">Flagged (7d)</div>
              <div className="text-2xl font-bold" data-testid="kpi-total">{summary.total}</div>
            </CardContent>
          </Card>
          {(["critical", "high", "medium", "low"] as RiskLevel[]).map((lvl) => (
            <Card key={lvl}>
              <CardContent className="pt-5">
                <div className="text-xs text-muted-foreground capitalize">{lvl}</div>
                <div className={`text-2xl font-bold ${
                  lvl === "critical" ? "text-red-600" :
                  lvl === "high" ? "text-orange-600" :
                  lvl === "medium" ? "text-yellow-600" : "text-green-600"
                }`} data-testid={`kpi-${lvl}`}>
                  {summary.byLevel[lvl]}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield size={20} /> Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Large amount ($)</Label>
                <Input
                  type="number"
                  value={settings.thresholds.largeAmount}
                  onChange={(e) => updateThreshold("largeAmount", Number(e.target.value))}
                  data-testid="input-large-amount"
                />
              </div>
              <div>
                <Label>Very large / critical amount ($)</Label>
                <Input
                  type="number"
                  value={settings.thresholds.veryLargeAmount}
                  onChange={(e) => updateThreshold("veryLargeAmount", Number(e.target.value))}
                  data-testid="input-very-large-amount"
                />
              </div>
              <div>
                <Label>Daily outgoing volume cap ($)</Label>
                <Input
                  type="number"
                  value={settings.thresholds.dailyVolume}
                  onChange={(e) => updateThreshold("dailyVolume", Number(e.target.value))}
                  data-testid="input-daily-volume"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rapid-fire count</Label>
                  <Input
                    type="number"
                    value={settings.thresholds.rapidFireCount}
                    onChange={(e) => updateThreshold("rapidFireCount", Number(e.target.value))}
                    data-testid="input-rapid-count"
                  />
                </div>
                <div>
                  <Label>Window (min)</Label>
                  <Input
                    type="number"
                    value={settings.thresholds.rapidFireWindowMin}
                    onChange={(e) => updateThreshold("rapidFireWindowMin", Number(e.target.value))}
                    data-testid="input-rapid-window"
                  />
                </div>
              </div>
              <div>
                <Label>Show alerts at or above</Label>
                <Select
                  value={settings.thresholds.minRiskToFlag}
                  onValueChange={(v) => updateThreshold("minRiskToFlag", v as RiskLevel)}
                >
                  <SelectTrigger data-testid="select-min-risk">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low and above</SelectItem>
                    <SelectItem value="medium">Medium and above</SelectItem>
                    <SelectItem value="high">High and above</SelectItem>
                    <SelectItem value="critical">Critical only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Lists */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck size={20} /> Watchlist & Trustlist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>Watchlist (always risky)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="user id"
                    value={watchInput}
                    onChange={(e) => setWatchInput(e.target.value)}
                    data-testid="input-watch"
                  />
                  <Button onClick={() => addToList("watchlist", watchInput)} className="gap-1">
                    <Plus size={14} /> Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {settings.watchlist.length === 0 && (
                    <span className="text-xs text-muted-foreground">No entries.</span>
                  )}
                  {settings.watchlist.map((id) => (
                    <Badge key={id} variant="destructive" className="gap-1">
                      {id.slice(0, 8)}…
                      <button onClick={() => removeFromList("watchlist", id)} className="ml-1">
                        <Trash2 size={11} />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>Trustlist (never flagged)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="user id"
                    value={trustInput}
                    onChange={(e) => setTrustInput(e.target.value)}
                    data-testid="input-trust"
                  />
                  <Button onClick={() => addToList("trustlist", trustInput)} className="gap-1">
                    <Plus size={14} /> Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {settings.trustlist.length === 0 && (
                    <span className="text-xs text-muted-foreground">No entries.</span>
                  )}
                  {settings.trustlist.map((id) => (
                    <Badge key={id} className="gap-1 bg-green-600">
                      {id.slice(0, 8)}…
                      <button onClick={() => removeFromList("trustlist", id)} className="ml-1">
                        <Trash2 size={11} />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live alerts */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle size={20} className="text-orange-500" />
              Flagged transactions (last 7 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-6 text-muted-foreground">Loading…</p>
            ) : scored.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground">
                {settings.enabled ? "Nothing flagged. All clear." : "AI security is disabled."}
              </p>
            ) : (
              <ul className="space-y-2">
                {scored.slice(0, 50).map((tx) => (
                  <li
                    key={tx.id}
                    className="border rounded-lg p-3 flex items-start justify-between gap-3"
                    data-testid={`alert-${tx.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={RISK_COLORS[tx.level]}>
                          {tx.level.toUpperCase()} · {tx.score}
                        </Badge>
                        {tx.wouldBlock && (
                          <Badge variant="destructive">AUTO-BLOCKED</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), "MMM d, HH:mm")} ·{" "}
                          {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="font-bold">${Number(tx.amount).toFixed(2)}</span>
                        <span className="text-muted-foreground"> · {tx.transaction_type}</span>
                        {tx.description && <span className="text-muted-foreground"> · {tx.description}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                        from {tx.sender_id.slice(0, 8)}… → {tx.receiver_id.slice(0, 8)}…
                      </div>
                      <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                        {tx.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => overrideClear(tx.id)}
                      data-testid={`button-clear-${tx.id}`}
                    >
                      Mark reviewed
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {scored.length > 50 && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                Showing 50 of {scored.length}. Tighten thresholds to narrow down.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          Settings saved on this device. Last updated{" "}
          {format(new Date(settings.lastUpdated), "MMM d, yyyy HH:mm")}.
        </p>
      </div>
    </div>
  );
};

export default AdminAISecurity;

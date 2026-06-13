import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, Shield, ShieldAlert, ShieldCheck, Brain, Zap,
  AlertTriangle, Lock, RefreshCw, Activity, Ban, Eye,
  Clock, Users, Fingerprint, TrendingUp, CheckCircle2,
  XCircle, BarChart3,
} from "lucide-react";
import { formatDistanceToNow, subHours, subMinutes } from "date-fns";

const STORAGE_KEY = "vbank_aidefense_v1";

interface DefenseSettings {
  enabled: boolean;
  doubleSpendEnabled: boolean;
  doubleSpendWindowSec: number;
  velocityEnabled: boolean;
  velocityMaxPerHour: number;
  atoEnabled: boolean;
  atoMaxFails: number;
  autoBlockEnabled: boolean;
  autoAlertEnabled: boolean;
}

const DEFAULT: DefenseSettings = {
  enabled: true,
  doubleSpendEnabled: true,
  doubleSpendWindowSec: 60,
  velocityEnabled: true,
  velocityMaxPerHour: 20,
  atoEnabled: true,
  atoMaxFails: 5,
  autoBlockEnabled: false,
  autoAlertEnabled: true,
};

function loadSettings(): DefenseSettings {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? { ...DEFAULT, ...JSON.parse(s) } : DEFAULT;
  } catch { return DEFAULT; }
}
function saveSettings(s: DefenseSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

interface Threat {
  id: string;
  type: "double_spend" | "velocity" | "ato" | "large_amount" | "pattern";
  severity: "medium" | "high" | "critical";
  userId: string;
  userPhone?: string;
  description: string;
  amount?: number;
  detectedAt: string;
  blocked: boolean;
}

function severityColor(s: string) {
  if (s === "critical") return "bg-red-500/15 text-red-700 border-red-200";
  if (s === "high") return "bg-orange-500/15 text-orange-700 border-orange-200";
  return "bg-yellow-500/15 text-yellow-700 border-yellow-200";
}
function severityBadge(s: string) {
  if (s === "critical") return <Badge className="bg-red-600 text-white text-[10px]">CRITICAL</Badge>;
  if (s === "high") return <Badge className="bg-orange-500 text-white text-[10px]">HIGH</Badge>;
  return <Badge className="bg-yellow-500 text-white text-[10px]">MEDIUM</Badge>;
}

export default function AdminAIDefense() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<DefenseSettings>(loadSettings());
  const [threats, setThreats] = useState<Threat[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastScan, setLastScan] = useState<Date | null>(null);
  const [stats, setStats] = useState({ total: 0, blocked: 0, critical: 0, usersMonitored: 0 });

  const patchSettings = (patch: Partial<DefenseSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };

  const runScan = useCallback(async () => {
    if (!settings.enabled) return;
    setLoading(true);
    const found: Threat[] = [];

    try {
      const windowStart = subHours(new Date(), 1).toISOString();
      const windowStartAto = subHours(new Date(), 24).toISOString();

      // ── 1. Fetch recent transactions ────────────────────────────────────────
      const { data: txs } = await supabase
        .from("transactions")
        .select("id, sender_id, receiver_id, amount, status, created_at, description")
        .gte("created_at", windowStart)
        .order("created_at", { ascending: false })
        .limit(500);

      if (txs) {
        // ── 2. Double-spend detection ───────────────────────────────────────
        if (settings.doubleSpendEnabled) {
          const windowMs = settings.doubleSpendWindowSec * 1000;
          const byUser: Record<string, typeof txs> = {};
          txs.forEach(t => {
            if (!byUser[t.sender_id]) byUser[t.sender_id] = [];
            byUser[t.sender_id].push(t);
          });
          for (const [userId, userTxs] of Object.entries(byUser)) {
            for (let i = 0; i < userTxs.length; i++) {
              for (let j = i + 1; j < userTxs.length; j++) {
                const a = userTxs[i], b = userTxs[j];
                const timeDiff = Math.abs(
                  new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                );
                if (
                  timeDiff <= windowMs &&
                  Math.abs(a.amount - b.amount) < 0.01 &&
                  a.receiver_id === b.receiver_id
                ) {
                  found.push({
                    id: `ds-${a.id}-${b.id}`,
                    type: "double_spend",
                    severity: "critical",
                    userId,
                    description: `Duplicate transaction: $${a.amount} to same recipient within ${settings.doubleSpendWindowSec}s`,
                    amount: a.amount,
                    detectedAt: a.created_at,
                    blocked: settings.autoBlockEnabled,
                  });
                  break;
                }
              }
            }
          }
        }

        // ── 3. Velocity check ───────────────────────────────────────────────
        if (settings.velocityEnabled) {
          const countByUser: Record<string, number> = {};
          const amountByUser: Record<string, number> = {};
          txs.forEach(t => {
            countByUser[t.sender_id] = (countByUser[t.sender_id] || 0) + 1;
            amountByUser[t.sender_id] = (amountByUser[t.sender_id] || 0) + t.amount;
          });
          for (const [userId, count] of Object.entries(countByUser)) {
            if (count >= settings.velocityMaxPerHour) {
              found.push({
                id: `vel-${userId}`,
                type: "velocity",
                severity: count >= settings.velocityMaxPerHour * 2 ? "critical" : "high",
                userId,
                description: `${count} transactions in 1 hour (limit: ${settings.velocityMaxPerHour}). Total: $${amountByUser[userId]?.toFixed(2)}`,
                amount: amountByUser[userId],
                detectedAt: txs.find(t => t.sender_id === userId)?.created_at ?? new Date().toISOString(),
                blocked: settings.autoBlockEnabled && count >= settings.velocityMaxPerHour * 2,
              });
            }
          }
        }

        // ── 4. Very large amounts ───────────────────────────────────────────
        txs.forEach(t => {
          if (t.amount >= 10000) {
            found.push({
              id: `large-${t.id}`,
              type: "large_amount",
              severity: t.amount >= 50000 ? "critical" : "high",
              userId: t.sender_id,
              description: `Unusually large transaction: $${t.amount.toLocaleString()}`,
              amount: t.amount,
              detectedAt: t.created_at,
              blocked: false,
            });
          }
        });
      }

      // ── 5. Account Takeover (failed auth attempts) ───────────────────────
      if (settings.atoEnabled) {
        const { data: auditLogs } = await supabase
          .from("audit_logs" as never)
          .select("user_id, action, metadata, created_at")
          .eq("action", "auth.failed")
          .gte("created_at", windowStartAto)
          .limit(200) as { data: Array<{ user_id: string; action: string; metadata: Record<string, unknown>; created_at: string }> | null };

        if (auditLogs) {
          const failsByUser: Record<string, number> = {};
          auditLogs.forEach(l => {
            failsByUser[l.user_id] = (failsByUser[l.user_id] || 0) + 1;
          });
          for (const [userId, count] of Object.entries(failsByUser)) {
            if (count >= settings.atoMaxFails) {
              found.push({
                id: `ato-${userId}`,
                type: "ato",
                severity: count >= settings.atoMaxFails * 2 ? "critical" : "high",
                userId,
                description: `${count} failed login attempts in 24h — possible account takeover`,
                detectedAt: auditLogs.find(l => l.user_id === userId)?.created_at ?? new Date().toISOString(),
                blocked: settings.autoBlockEnabled && count >= settings.atoMaxFails * 2,
              });
            }
          }
        }
      }

      // ── Enrich with phone numbers ─────────────────────────────────────────
      const userIds = [...new Set(found.map(t => t.userId))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, phone_number, full_name")
          .in("id", userIds);
        const phoneMap: Record<string, string> = {};
        profiles?.forEach(p => { phoneMap[p.id] = p.phone_number || p.full_name || p.id.slice(0, 8); });
        found.forEach(t => { t.userPhone = phoneMap[t.userId] || t.userId.slice(0, 8); });
      }

      // ── Auto-block (update profile status) ───────────────────────────────
      if (settings.autoBlockEnabled) {
        const toBlock = found.filter(t => t.blocked && (t.severity === "critical")).map(t => t.userId);
        for (const uid of [...new Set(toBlock)]) {
          await supabase
            .from("profiles")
            .update({ status: "suspended" } as never)
            .eq("id", uid);
        }
        if (toBlock.length > 0) {
          toast.error(`Auto-blocked ${[...new Set(toBlock)].length} account(s)`);
        }
      }

      const deduplicated = found.filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);
      deduplicated.sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2 };
        return order[a.severity] - order[b.severity];
      });

      setThreats(deduplicated);
      setStats({
        total: deduplicated.length,
        blocked: deduplicated.filter(t => t.blocked).length,
        critical: deduplicated.filter(t => t.severity === "critical").length,
        usersMonitored: [...new Set((txs || []).map(t => t.sender_id))].length,
      });
      setLastScan(new Date());
    } catch (err) {
      toast.error("Scan error — check console");
      console.error(err);
    }
    setLoading(false);
  }, [settings]);

  useEffect(() => {
    runScan();
    const interval = setInterval(runScan, 60_000);
    return () => clearInterval(interval);
  }, [runScan]);

  const blockUser = async (userId: string) => {
    await supabase.from("profiles").update({ status: "suspended" } as never).eq("id", userId);
    setThreats(prev => prev.map(t => t.userId === userId ? { ...t, blocked: true } : t));
    toast.success("Account suspended");
  };

  const dismissThreat = (id: string) => setThreats(prev => prev.filter(t => t.id !== id));

  const threatIcon = (type: string) => {
    if (type === "double_spend") return <Ban className="h-4 w-4" />;
    if (type === "velocity") return <Zap className="h-4 w-4" />;
    if (type === "ato") return <Fingerprint className="h-4 w-4" />;
    if (type === "large_amount") return <TrendingUp className="h-4 w-4" />;
    return <AlertTriangle className="h-4 w-4" />;
  };
  const threatLabel = (type: string) => {
    if (type === "double_spend") return "Double Spend";
    if (type === "velocity") return "Velocity Fraud";
    if (type === "ato") return "Account Takeover";
    if (type === "large_amount") return "Large Amount";
    return "Pattern";
  };

  const overallLevel = stats.critical > 0 ? "CRITICAL" : stats.total > 0 ? "ELEVATED" : "NORMAL";
  const levelColor = overallLevel === "CRITICAL" ? "text-red-600 bg-red-50 border-red-200"
    : overallLevel === "ELEVATED" ? "text-orange-600 bg-orange-50 border-orange-200"
    : "text-green-600 bg-green-50 border-green-200";

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-to-r from-red-700 to-orange-600 text-white p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-black flex items-center gap-2">
              <Brain className="h-6 w-6" /> AI Defense Center
            </h1>
            <p className="text-xs text-white/70">Production fraud & attack prevention</p>
          </div>
        </div>
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${levelColor}`}>
          {overallLevel === "NORMAL" ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          <span className="font-black text-sm">{overallLevel}</span>
          <span className="text-xs opacity-75 ml-auto">
            {lastScan ? `Scanned ${formatDistanceToNow(lastScan)} ago` : "Scanning…"}
          </span>
          <Button size="icon" variant="ghost" onClick={runScan} disabled={loading} className="h-7 w-7 ml-1">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: AlertTriangle, label: "Threats", value: stats.total, color: "text-orange-600" },
            { icon: Ban, label: "Blocked", value: stats.blocked, color: "text-red-600" },
            { icon: ShieldAlert, label: "Critical", value: stats.critical, color: "text-red-700" },
            { icon: Users, label: "Monitored", value: stats.usersMonitored, color: "text-blue-600" },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="text-center">
              <CardContent className="p-3">
                <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
                <p className={`text-xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Master Toggle */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" /> AI Defense Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable AI Defense</p>
                <p className="text-xs text-muted-foreground">Real-time threat scanning every 60s</p>
              </div>
              <Switch checked={settings.enabled} onCheckedChange={v => patchSettings({ enabled: v })} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600">Auto-Block Accounts</p>
                <p className="text-xs text-muted-foreground">Suspend critical-threat accounts automatically</p>
              </div>
              <Switch
                checked={settings.autoBlockEnabled}
                onCheckedChange={v => {
                  patchSettings({ autoBlockEnabled: v });
                  if (v) toast.warning("Auto-block enabled — critical accounts will be suspended");
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Double-Spend Prevention */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4 text-red-600" /> Double-Spend Prevention
            </CardTitle>
            <CardDescription>Detects duplicate transactions to the same recipient within a time window</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Enable</p>
              <Switch checked={settings.doubleSpendEnabled} onCheckedChange={v => patchSettings({ doubleSpendEnabled: v })} />
            </div>
            {settings.doubleSpendEnabled && (
              <div>
                <Label className="text-xs">Detection Window (seconds)</Label>
                <Input
                  type="number" min={10} max={3600}
                  value={settings.doubleSpendWindowSec}
                  onChange={e => patchSettings({ doubleSpendWindowSec: parseInt(e.target.value) || 60 })}
                  className="h-8 text-sm mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Flag identical amount + recipient transactions within this window
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Velocity Rate Limiting */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Zap className="h-4 w-4 text-yellow-600" /> Velocity Rate Limiting
            </CardTitle>
            <CardDescription>Flags users sending too many transactions per hour</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Enable</p>
              <Switch checked={settings.velocityEnabled} onCheckedChange={v => patchSettings({ velocityEnabled: v })} />
            </div>
            {settings.velocityEnabled && (
              <div>
                <Label className="text-xs">Max Transactions / Hour</Label>
                <Input
                  type="number" min={5} max={200}
                  value={settings.velocityMaxPerHour}
                  onChange={e => patchSettings({ velocityMaxPerHour: parseInt(e.target.value) || 20 })}
                  className="h-8 text-sm mt-1"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Takeover Guard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Fingerprint className="h-4 w-4 text-purple-600" /> Account Takeover Guard
            </CardTitle>
            <CardDescription>Detects brute-force and credential-stuffing attacks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Enable</p>
              <Switch checked={settings.atoEnabled} onCheckedChange={v => patchSettings({ atoEnabled: v })} />
            </div>
            {settings.atoEnabled && (
              <div>
                <Label className="text-xs">Max Failed Logins (24h) before alert</Label>
                <Input
                  type="number" min={3} max={50}
                  value={settings.atoMaxFails}
                  onChange={e => patchSettings({ atoMaxFails: parseInt(e.target.value) || 5 })}
                  className="h-8 text-sm mt-1"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Threat Feed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-orange-600" />
              Live Threat Feed
              {threats.length > 0 && (
                <Badge className="ml-auto bg-red-600 text-white">{threats.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <RefreshCw className="h-4 w-4 animate-spin" /> Scanning transactions…
              </div>
            )}
            {!loading && threats.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <ShieldCheck className="h-10 w-10 text-green-500" />
                <p className="text-sm font-medium text-green-600">No threats detected</p>
                <p className="text-xs text-muted-foreground">System is clean — last scan: {lastScan ? formatDistanceToNow(lastScan) + " ago" : "pending"}</p>
              </div>
            )}
            <div className="space-y-2">
              {threats.map(t => (
                <div key={t.id} className={`border rounded-xl p-3 ${severityColor(t.severity)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {threatIcon(t.type)}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase">{threatLabel(t.type)}</span>
                          {severityBadge(t.severity)}
                          {t.blocked && <Badge variant="outline" className="text-[10px] border-red-300 text-red-700">BLOCKED</Badge>}
                        </div>
                        <p className="text-xs mt-0.5">{t.description}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">
                          User: {t.userPhone} · {formatDistanceToNow(new Date(t.detectedAt))} ago
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!t.blocked && (
                        <Button size="sm" variant="ghost" onClick={() => blockUser(t.userId)}
                          className="h-7 px-2 text-red-700 hover:bg-red-100 text-xs">
                          <Lock className="h-3 w-3 mr-1" /> Block
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => dismissThreat(t.id)}
                        className="h-7 w-7 p-0 text-muted-foreground">
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rules Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4" /> Active Defence Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { name: "Double-Spend Prevention", enabled: settings.doubleSpendEnabled, detail: `${settings.doubleSpendWindowSec}s window` },
              { name: "Velocity Rate Limiting", enabled: settings.velocityEnabled, detail: `max ${settings.velocityMaxPerHour}/hr` },
              { name: "Account Takeover Guard", enabled: settings.atoEnabled, detail: `alert after ${settings.atoMaxFails} fails` },
              { name: "Large Amount Detection", enabled: true, detail: "flags >$10,000" },
              { name: "Auto-Block Engine", enabled: settings.autoBlockEnabled, detail: "suspends critical accounts" },
            ].map(rule => (
              <div key={rule.name} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  {rule.enabled
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  <span className="text-sm">{rule.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{rule.detail}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

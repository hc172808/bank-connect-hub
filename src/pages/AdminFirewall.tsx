import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Shield, ShieldAlert, ShieldCheck, ShieldOff,
  Power, Plus, Trash2, RefreshCw, Clock, DollarSign,
  Zap, Eye, Lock, AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  FirewallRules, DEFAULT_FIREWALL_RULES,
  loadFirewallRules, saveFirewallRules,
} from "@/lib/aiFirewall";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";

interface BlockedAttempt {
  id: string;
  created_at: string;
  amount: number;
  transaction_type: string;
  sender_id: string;
  status: string;
}

const AdminFirewall = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rules, setRules] = useState<FirewallRules>(DEFAULT_FIREWALL_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addrInput, setAddrInput] = useState("");
  const [kwInput, setKwInput] = useState("");
  const [recentBlocked, setRecentBlocked] = useState<BlockedAttempt[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadFirewallRules().then(r => { setRules(r); setLoading(false); });
    fetchBlocked();
  }, []);

  const fetchBlocked = async () => {
    setRefreshing(true);
    const { data } = await supabase
      .from("transactions")
      .select("id, created_at, amount, transaction_type, sender_id, status")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setRecentBlocked(data);
    setRefreshing(false);
  };

  const save = useCallback(async (patch: Partial<FirewallRules>) => {
    const next: FirewallRules = { ...rules, ...patch, lastUpdated: Date.now() };
    setRules(next);
    setSaving(true);
    try {
      await saveFirewallRules(next);
      toast({ title: "Firewall rules saved", description: "Changes are live immediately." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
    setSaving(false);
  }, [rules, toast]);

  const addAddr = () => {
    const v = addrInput.trim();
    if (!v || rules.blockedAddresses.includes(v)) return;
    save({ blockedAddresses: [...rules.blockedAddresses, v] });
    setAddrInput("");
  };

  const removeAddr = (v: string) =>
    save({ blockedAddresses: rules.blockedAddresses.filter(a => a !== v) });

  const addKw = () => {
    const v = kwInput.trim().toLowerCase();
    if (!v || rules.blockedKeywords.includes(v)) return;
    save({ blockedKeywords: [...rules.blockedKeywords, v] });
    setKwInput("");
  };

  const removeKw = (v: string) =>
    save({ blockedKeywords: rules.blockedKeywords.filter(k => k !== v) });

  const resetDefaults = async () => {
    const defaults = { ...DEFAULT_FIREWALL_RULES, lastUpdated: Date.now() };
    setRules(defaults);
    await saveFirewallRules(defaults);
    toast({ title: "Reset to defaults" });
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <RefreshCw className="animate-spin text-primary" size={32} />
    </div>
  );

  const statusColor = rules.enabled
    ? rules.blockOnCritical || rules.blockOnHigh ? "border-green-500/40" : "border-yellow-500/40"
    : "border-destructive/40";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-5xl mx-auto">

        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back">
          <ArrowLeft size={20} className="mr-2" /> Back to Admin
        </Button>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <ShieldAlert className="text-primary" size={32} />
              AI Firewall
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Real-time transaction firewall. Every transfer is screened before it goes through.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={fetchBlocked} disabled={refreshing} className="gap-2" data-testid="button-refresh">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
            </Button>
            <Button variant="outline" onClick={resetDefaults} data-testid="button-reset">
              Reset defaults
            </Button>
          </div>
        </div>

        {/* Master toggle */}
        <Card className={`mb-6 border-2 ${statusColor}`}>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${rules.enabled ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"}`}>
                  <Power size={24} />
                </div>
                <div>
                  <div className="font-bold text-lg">Firewall is {rules.enabled ? "ACTIVE" : "OFF"}</div>
                  <p className="text-sm text-muted-foreground">
                    {rules.enabled ? "All outgoing transfers are screened in real time." : "Firewall is disabled — all transfers pass through unchecked."}
                  </p>
                </div>
              </div>
              <Switch checked={rules.enabled} onCheckedChange={v => save({ enabled: v })} className="scale-125" data-testid="switch-enabled" />
            </div>

            <Separator />

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={18} className="text-destructive" />
                  <div>
                    <div className="font-medium text-sm">Block Critical Risk</div>
                    <div className="text-xs text-muted-foreground">Auto-block score ≥ 80</div>
                  </div>
                </div>
                <Switch checked={rules.blockOnCritical} disabled={!rules.enabled} onCheckedChange={v => save({ blockOnCritical: v })} data-testid="switch-block-critical" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-orange-500" />
                  <div>
                    <div className="font-medium text-sm">Block High Risk</div>
                    <div className="text-xs text-muted-foreground">Auto-block score ≥ 60</div>
                  </div>
                </div>
                <Switch checked={rules.blockOnHigh} disabled={!rules.enabled} onCheckedChange={v => save({ blockOnHigh: v })} data-testid="switch-block-high" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-6">

          {/* Amount limits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><DollarSign size={18} /> Amount Limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Max single transaction ($)</Label>
                <Input type="number" value={rules.maxSingleAmount} disabled={!rules.enabled}
                  onChange={e => save({ maxSingleAmount: Number(e.target.value) })}
                  data-testid="input-max-single" />
              </div>
              <div>
                <Label>Max daily outgoing ($)</Label>
                <Input type="number" value={rules.maxDailyAmount} disabled={!rules.enabled}
                  onChange={e => save({ maxDailyAmount: Number(e.target.value) })}
                  data-testid="input-max-daily" />
              </div>
              <div>
                <Label>Minimum amount ($) — dust attack guard</Label>
                <Input type="number" step="0.001" value={rules.minAmount} disabled={!rules.enabled}
                  onChange={e => save({ minAmount: Number(e.target.value) })}
                  data-testid="input-min-amount" />
              </div>
              <div>
                <Label>Structuring threshold ($) — 0 = off</Label>
                <Input type="number" value={rules.structuringThreshold} disabled={!rules.enabled}
                  onChange={e => save({ structuringThreshold: Number(e.target.value) })}
                  data-testid="input-structuring" />
                <p className="text-xs text-muted-foreground mt-1">Flag amounts just below round numbers (money-laundering signal)</p>
              </div>
              <div>
                <Label>Require note for amounts above ($) — 0 = off</Label>
                <Input type="number" value={rules.requireNoteAbove} disabled={!rules.enabled}
                  onChange={e => save({ requireNoteAbove: Number(e.target.value) })}
                  data-testid="input-require-note" />
              </div>
            </CardContent>
          </Card>

          {/* Velocity & time */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Zap size={18} /> Velocity & Time Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Max transactions per hour</Label>
                <Input type="number" value={rules.maxTxPerHour} disabled={!rules.enabled}
                  onChange={e => save({ maxTxPerHour: Number(e.target.value) })}
                  data-testid="input-max-per-hour" />
              </div>
              <Separator />
              <div>
                <Label className="flex items-center gap-2"><Clock size={14} /> Block transactions between these hours</Label>
                <p className="text-xs text-muted-foreground mb-2">Both 0 = disabled. Uses server local time (24h).</p>
                <div className="flex gap-3 items-center">
                  <Input type="number" min={0} max={23} value={rules.blockedHoursStart} disabled={!rules.enabled}
                    onChange={e => save({ blockedHoursStart: Number(e.target.value) })}
                    placeholder="From" className="w-24" data-testid="input-hours-start" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="number" min={0} max={23} value={rules.blockedHoursEnd} disabled={!rules.enabled}
                    onChange={e => save({ blockedHoursEnd: Number(e.target.value) })}
                    placeholder="To" className="w-24" data-testid="input-hours-end" />
                </div>
                {rules.blockedHoursStart !== 0 || rules.blockedHoursEnd !== 0 ? (
                  <Badge variant="secondary" className="mt-2 gap-1">
                    <Lock size={11} />
                    Blocked: {rules.blockedHoursStart}:00 – {rules.blockedHoursEnd}:00
                  </Badge>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Time restriction disabled</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Blocked addresses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><ShieldOff size={18} /> Blocked Addresses / Users</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Wallet address or user ID"
                  value={addrInput}
                  disabled={!rules.enabled}
                  onChange={e => setAddrInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addAddr()}
                  data-testid="input-add-address"
                />
                <Button onClick={addAddr} disabled={!rules.enabled || !addrInput.trim()} className="gap-1">
                  <Plus size={14} /> Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 min-h-[40px]">
                {rules.blockedAddresses.length === 0 && (
                  <span className="text-xs text-muted-foreground">No blocked addresses.</span>
                )}
                {rules.blockedAddresses.map(addr => (
                  <Badge key={addr} variant="destructive" className="gap-1 font-mono" data-testid={`badge-addr-${addr.slice(0,8)}`}>
                    {addr.slice(0, 10)}…
                    <button onClick={() => removeAddr(addr)}><Trash2 size={11} /></button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Blocked keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Eye size={18} /> Blocked Description Keywords</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">If a transaction description contains any of these words, it is blocked.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. gambling, drugs"
                  value={kwInput}
                  disabled={!rules.enabled}
                  onChange={e => setKwInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addKw()}
                  data-testid="input-add-keyword"
                />
                <Button onClick={addKw} disabled={!rules.enabled || !kwInput.trim()} className="gap-1">
                  <Plus size={14} /> Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1 min-h-[40px]">
                {rules.blockedKeywords.length === 0 && (
                  <span className="text-xs text-muted-foreground">No keyword blocks.</span>
                )}
                {rules.blockedKeywords.map(kw => (
                  <Badge key={kw} variant="outline" className="gap-1 border-destructive text-destructive">
                    {kw}
                    <button onClick={() => removeKw(kw)}><Trash2 size={11} /></button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent blocked/failed transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle size={18} className="text-destructive" />
              Recent Failed / Blocked Transactions (last 30)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentBlocked.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShieldCheck size={40} className="mx-auto mb-2 text-green-500 opacity-60" />
                No blocked transactions found. All clear.
              </div>
            ) : (
              <ul className="space-y-2">
                {recentBlocked.map(tx => (
                  <li key={tx.id} className="border border-destructive/20 rounded-lg p-3 flex items-center justify-between gap-3 bg-destructive/5" data-testid={`blocked-${tx.id}`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="destructive">FAILED</Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), "MMM d, HH:mm")} · {formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-sm font-medium">${Number(tx.amount).toFixed(2)} · {tx.transaction_type}</div>
                      <div className="text-xs text-muted-foreground font-mono">from {tx.sender_id.slice(0, 12)}…</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Rules are stored in Supabase and apply to all sessions instantly · Last updated {format(new Date(rules.lastUpdated), "MMM d, yyyy HH:mm")}
          {saving && <span className="ml-2 text-primary animate-pulse">Saving…</span>}
        </p>
      </div>
    </div>
  );
};

export default AdminFirewall;

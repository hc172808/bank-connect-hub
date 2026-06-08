import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users, DollarSign, TrendingUp, Activity, QrCode, LogOut,
  ArrowUpRight, ArrowDownLeft, Plus, Send, BarChart3, Clock,
  RefreshCw, ChevronRight, Wallet, Receipt, Phone, UserCheck,
  AlertCircle, CheckCircle2,
} from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { requestNotificationPermission, subscribeToTransactionNotifications } from "@/lib/pushNotifications";
import { format, startOfDay, startOfMonth, subDays } from "date-fns";

interface ProfileData { full_name: string; phone_number: string | null; }
interface Client { id: string; full_name: string; phone_number: string | null; created_at: string; }
interface TxRow { amount: number; transaction_type: string; created_at: string; status: string; description: string | null; fee: number | null; sender_id: string; receiver_id: string; }
interface DayBar { label: string; volume: number; count: number; }

const AgentDashboard = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [userId, setUserId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [txRows, setTxRows] = useState<TxRow[]>([]);
  const [monthCommission, setMonthCommission] = useState(0);
  const [todayTxCount, setTodayTxCount] = useState(0);
  const [todayVolume, setTodayVolume] = useState(0);
  const [weekBars, setWeekBars] = useState<DayBar[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [successRate, setSuccessRate] = useState(100);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }
    setUserId(user.id);

    const sevenDaysAgo = subDays(new Date(), 7).toISOString();

    const [profileRes, clientsRes, txRes, pendingRes] = await Promise.all([
      supabase.from("profiles").select("full_name, phone_number").eq("id", user.id).single(),
      supabase.from("profiles").select("id, full_name, phone_number, created_at").eq("agent_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("transactions").select("amount, transaction_type, created_at, status, description, fee, sender_id, receiver_id")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false }),
      supabase.from("transactions").select("id", { count: "exact", head: true })
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq("status", "pending"),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (pendingRes.count !== null) setPendingCount(pendingRes.count);

    if (txRes.data) {
      const rows = txRes.data as TxRow[];
      setTxRows(rows);

      const todayStart = startOfDay(new Date()).toISOString();
      const todayRows = rows.filter(t => t.created_at >= todayStart);
      setTodayTxCount(todayRows.length);
      setTodayVolume(todayRows.reduce((s, t) => s + Number(t.amount || 0), 0));

      const monthStart = startOfMonth(new Date()).toISOString();
      const monthFees = rows.filter(t => t.created_at >= monthStart && t.fee);
      setMonthCommission(monthFees.reduce((s, t) => s + Number(t.fee || 0), 0));

      const completed = rows.filter(t => t.status === "completed").length;
      setSuccessRate(rows.length > 0 ? Math.round((completed / rows.length) * 100) : 100);

      const bars: DayBar[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = subDays(new Date(), i);
        const dayStr = format(day, "yyyy-MM-dd");
        const dayRows = rows.filter(t => t.created_at.startsWith(dayStr));
        bars.push({
          label: format(day, "EEE"),
          volume: dayRows.reduce((s, t) => s + Number(t.amount || 0), 0),
          count: dayRows.length,
        });
      }
      setWeekBars(bars);
    }

    setLastRefresh(new Date());
    setLoading(false);

    // Enable push notifications
    const granted = await requestNotificationPermission();
    if (granted) subscribeToTransactionNotifications(user.id);
  }, [navigate]);

  useEffect(() => {
    fetchAll();
    return () => { /* cleanup handled by pushNotifications */ };
  }, [fetchAll]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  const maxVol = Math.max(...weekBars.map(b => b.volume), 1);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary p-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-primary-foreground">Agent Portal</h1>
            <p className="text-sm text-primary-foreground/80">Welcome, {profile?.full_name || "Agent"}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button onClick={handleLogout} size="sm" variant="secondary" className="rounded-xl gap-1">
              <LogOut size={14} /> Logout
            </Button>
          </div>
        </div>

        {/* KPI row in header */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "My Clients", value: loading ? "—" : String(clients.length), sub: "registered", icon: Users, color: "text-blue-400" },
            { label: "Commission", value: loading ? "—" : `$${monthCommission.toFixed(2)}`, sub: "this month", icon: DollarSign, color: "text-green-400" },
            { label: "Today TXs", value: loading ? "—" : String(todayTxCount), sub: `$${todayVolume.toFixed(0)} volume`, icon: Activity, color: "text-purple-400" },
            { label: "Success Rate", value: loading ? "—" : `${successRate}%`, sub: "last 7 days", icon: TrendingUp, color: successRate >= 90 ? "text-green-400" : "text-yellow-400" },
          ].map(k => (
            <div key={k.label} className="bg-white/10 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <k.icon size={13} className={k.color} />
                <span className="text-[11px] text-primary-foreground/70">{k.label}</span>
              </div>
              <div className="text-lg font-bold text-primary-foreground">{k.value}</div>
              <div className="text-[10px] text-primary-foreground/50">{k.sub}</div>
            </div>
          ))}
        </div>
      </header>

      <main className="p-4 space-y-4 pb-24 max-w-3xl mx-auto">

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Plus, label: "Add Funds", path: "/agent-deposit", color: "text-green-600" },
            { icon: QrCode, label: "Print QR", path: "/print-qr", color: "text-blue-600" },
            { icon: Send, label: "Send Money", path: "/send-money", color: "text-purple-600" },
            { icon: Receipt, label: "Transactions", path: "/transactions", color: "text-orange-600" },
          ].map(a => (
            <button key={a.label} onClick={() => navigate(a.path)}
              className="flex flex-col items-center gap-2 bg-card border rounded-xl p-3 hover:shadow-md transition-all active:scale-95">
              <div className={`w-10 h-10 rounded-full bg-muted flex items-center justify-center ${a.color}`}>
                <a.icon size={20} />
              </div>
              <span className="text-[10px] font-medium text-center leading-tight">{a.label}</span>
            </button>
          ))}
        </div>

        {/* Pending alert */}
        {pendingCount > 0 && (
          <Card className="border-yellow-500/40 bg-yellow-500/5 cursor-pointer" onClick={() => navigate("/agent-deposit")}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                  <AlertCircle size={18} className="text-yellow-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{pendingCount} pending transaction{pendingCount > 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">Tap to review and process</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* 7-day chart */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 size={17} className="text-primary" /> 7-Day Activity
              </CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Updated {format(lastRefresh, "HH:mm")}</span>
                <Button variant="ghost" size="icon" onClick={fetchAll} className="h-7 w-7">
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {weekBars.every(b => b.volume === 0) ? (
              <p className="text-xs text-muted-foreground text-center py-4">No transaction activity this week</p>
            ) : (
              <div className="flex items-end gap-1.5 h-24">
                {weekBars.map(bar => (
                  <div key={bar.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[9px] text-muted-foreground">{bar.count > 0 ? bar.count : ""}</div>
                    <div className="w-full flex items-end justify-center" style={{ height: "68px" }}>
                      <div
                        className="w-full rounded-t-md bg-primary/70 min-h-[3px] transition-all"
                        style={{ height: `${Math.max((bar.volume / maxVol) * 100, 4)}%` }}
                        title={`$${bar.volume.toFixed(2)}`}
                      />
                    </div>
                    <div className="text-[9px] text-muted-foreground font-medium">{bar.label}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance mini-cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center">
            <CardContent className="pt-4 pb-3">
              <CheckCircle2 size={20} className="mx-auto mb-1 text-green-600" />
              <div className="text-xl font-bold text-green-600">{successRate}%</div>
              <div className="text-[10px] text-muted-foreground">Success rate</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4 pb-3">
              <UserCheck size={20} className="mx-auto mb-1 text-blue-600" />
              <div className="text-xl font-bold">{clients.length}</div>
              <div className="text-[10px] text-muted-foreground">Clients</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-4 pb-3">
              <Wallet size={20} className="mx-auto mb-1 text-purple-600" />
              <div className="text-xl font-bold">${monthCommission.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground">Commission</div>
            </CardContent>
          </Card>
        </div>

        {/* Client List */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={17} /> My Clients
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/agent-deposit")} className="text-xs gap-1">
                <Plus size={13} /> Register
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {clients.length === 0 ? (
              <div className="text-center py-6">
                <Users size={32} className="mx-auto mb-2 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">No clients registered yet</p>
                <Button size="sm" className="mt-3 gap-1" onClick={() => navigate("/agent-deposit")}>
                  <Plus size={14} /> Register First Client
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {clients.slice(0, 8).map(c => (
                  <div key={c.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate("/agent-deposit")}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0 text-sm">
                      {(c.full_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone size={10} /> {c.phone_number || "—"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {format(new Date(c.created_at), "d MMM")}
                    </Badge>
                  </div>
                ))}
                {clients.length > 8 && (
                  <p className="text-xs text-center text-muted-foreground pt-1">+{clients.length - 8} more clients</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock size={17} /> Recent Transactions
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/transactions")} className="text-xs">
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {txRows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No transactions this week</p>
            ) : (
              <div className="space-y-2">
                {txRows.slice(0, 6).map((t, i) => {
                  const isIn = t.receiver_id === userId;
                  return (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isIn ? "bg-green-500/10" : "bg-red-500/10"}`}>
                          {isIn
                            ? <ArrowDownLeft size={14} className="text-green-600" />
                            : <ArrowUpRight size={14} className="text-red-500" />}
                        </div>
                        <div>
                          <p className="text-xs font-medium capitalize">{t.transaction_type}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(t.created_at), "d MMM HH:mm")}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${isIn ? "text-green-600" : "text-red-500"}`}>
                          {isIn ? "+" : "-"}${Number(t.amount).toFixed(2)}
                        </p>
                        <Badge
                          variant={t.status === "completed" ? "default" : t.status === "pending" ? "secondary" : "destructive"}
                          className="text-[9px] px-1"
                        >
                          {t.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

      </main>
    </div>
  );
};

export default AgentDashboard;

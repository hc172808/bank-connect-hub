/* eslint-disable @typescript-eslint/no-explicit-any */
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Users, Briefcase, Shield, Settings, BarChart3, FileText, DollarSign, Wallet, CheckCircle, Database, Coins, ArrowRightLeft, ToggleLeft, Store, QrCode, Bell, RotateCcw, Smartphone, Info, Pencil, Brain, Activity, AlertTriangle, Palette, ShieldAlert, Cpu, ShieldCheck, Megaphone, Globe, Terminal, Network, Scale } from "lucide-react";
import { loadAISettings, scoreTransactions, summarizeRisk } from "@/lib/aiSecurity";
import { AdminFeeWalletWidget } from "@/components/AdminFeeWalletWidget";
import { NotificationBell } from "@/components/NotificationBell";

interface ChangelogEntry {
  id: string;
  version: string;
  is_latest: boolean;
  items: string[];
  released_at: string;
}

interface ProfileData {
  full_name: string;
}

const AdminDashboard = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeAgents, setActiveAgents] = useState(0);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [todayVolume, setTodayVolume] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [aiSummary, setAiSummary] = useState<{ critical: number; high: number; total: number; enabled: boolean }>({
    critical: 0, high: 0, total: 0, enabled: true,
  });
  const [weekBars, setWeekBars] = useState<{ label: string; volume: number; count: number }[]>([]);
  const [newUsersWeek, setNewUsersWeek] = useState(0);
  const [totalFeesWeek, setTotalFeesWeek] = useState(0);
  const [recentTxs, setRecentTxs] = useState<any[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
    fetchCounts();
    fetchChangelog();
    fetchTodayStats();
    fetchAiSummary();
    fetchWeeklyStats();
    // Auto-refresh KPIs every 30s
    const interval = setInterval(() => {
      fetchTodayStats();
      fetchWeeklyStats();
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTodayStats = async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data, count } = await supabase
      .from("transactions")
      .select("amount", { count: "exact" })
      .eq("status", "completed")
      .gte("created_at", start.toISOString());
    if (data) {
      const sum = (data as any[]).reduce((a, t) => a + Number(t.amount || 0), 0);
      setTodayVolume(sum);
    }
    if (count !== null) setTodayCount(count);

    const { count: pCount } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (pCount !== null) setPendingDeposits(pCount);
  };

  const fetchAiSummary = async () => {
    const settings = loadAISettings();
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("transactions")
      .select("id, amount, fee, status, transaction_type, description, created_at, sender_id, receiver_id")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) {
      const scored = scoreTransactions(data as any, settings);
      const sum = summarizeRisk(scored);
      setAiSummary({
        critical: sum.byLevel.critical,
        high: sum.byLevel.high,
        total: sum.total,
        enabled: settings.enabled,
      });
    }
  };

  const fetchCounts = async () => {
    // Total users
    const { count: userCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    if (userCount !== null) setTotalUsers(userCount);

    // Active agents
    const { count: agentCount } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "agent");
    if (agentCount !== null) setActiveAgents(agentCount);
  };

  const fetchWeeklyStats = async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: txData } = await supabase
      .from("transactions")
      .select("amount, fee, created_at, status")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false });

    if (txData) {
      setRecentTxs((txData as any[]).slice(0, 6));
      setTotalFeesWeek((txData as any[]).reduce((s, t) => s + Number(t.fee || 0), 0));

      const bars: { label: string; volume: number; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dayStr = d.toISOString().split("T")[0];
        const dayRows = (txData as any[]).filter(t => t.created_at.startsWith(dayStr));
        bars.push({
          label: d.toLocaleDateString("en", { weekday: "short" }),
          volume: dayRows.reduce((s, t) => s + Number(t.amount || 0), 0),
          count: dayRows.length,
        });
      }
      setWeekBars(bars);
    }

    const { count: newUsers } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);
    if (newUsers !== null) setNewUsersWeek(newUsers);

    setLastRefresh(new Date());
  };

  const fetchChangelog = async () => {
    const { data } = await supabase
      .from("changelog_entries")
      .select("*")
      .order("released_at", { ascending: false })
      .limit(5);
    if (data) setChangelog(data.map((d: any) => ({ ...d, items: d.items as string[] })));
  };

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    if (profileData) setProfile(profileData);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-foreground/80">Welcome, {profile?.full_name || "Admin"}</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button
              onClick={handleLogout}
              variant="secondary"
              className="rounded-xl"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="kpi-total-users">{totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">Agents</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="kpi-agents">{activeAgents}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">Today Vol.</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="kpi-today-vol">${todayVolume.toFixed(0)}</div>
              <p className="text-[10px] text-muted-foreground">{todayCount} txs</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">Pending</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-yellow-600" data-testid="kpi-pending">{pendingDeposits}</div>
              <p className="text-[10px] text-muted-foreground">need review</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer hover:shadow-md transition ${aiSummary.critical > 0 ? "border-red-500/40" : ""}`}
            onClick={() => navigate("/admin/ai-security")}
            data-testid="card-ai-alerts"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-1">
                <Brain className="h-3.5 w-3.5" /> AI Alerts
              </CardTitle>
              <AlertTriangle className={`h-4 w-4 ${aiSummary.critical > 0 ? "text-red-500" : "text-muted-foreground"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold" data-testid="kpi-ai-alerts">
                {aiSummary.enabled ? aiSummary.total : "—"}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {aiSummary.enabled
                  ? `${aiSummary.critical} critical · ${aiSummary.high} high`
                  : "AI disabled"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">System</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-primary">Healthy</div>
              <p className="text-[10px] text-muted-foreground">all good</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional KPIs row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">New Users (7d)</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-blue-600">{newUsersWeek}</div>
              <p className="text-[10px] text-muted-foreground">registered this week</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium">Fees (7d)</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-green-600">${totalFeesWeek.toFixed(2)}</div>
              <p className="text-[10px] text-muted-foreground">collected this week</p>
            </CardContent>
          </Card>
          <Card className="col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" /> 7-Day Volume
              </CardTitle>
              <span className="text-[10px] text-muted-foreground">
                Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </CardHeader>
            <CardContent>
              {weekBars.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Loading...</p>
              ) : (
                <div className="flex items-end gap-1.5 h-16">
                  {weekBars.map(bar => {
                    const maxVol = Math.max(...weekBars.map(b => b.volume), 1);
                    return (
                      <div key={bar.label} className="flex-1 flex flex-col items-center gap-0.5">
                        <div className="w-full flex items-end justify-center" style={{ height: "44px" }}>
                          <div
                            className="w-full rounded-t bg-primary/60 min-h-[2px]"
                            style={{ height: `${Math.max((bar.volume / maxVol) * 100, 4)}%` }}
                            title={`$${bar.volume.toFixed(0)} · ${bar.count} txs`}
                          />
                        </div>
                        <div className="text-[8px] text-muted-foreground">{bar.label}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>System Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/users")}
              >
                <Users size={20} />
                Manage Users
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl" 
                variant="secondary"
                onClick={() => navigate("/admin/agents")}
              >
                <Briefcase size={20} />
                Manage Agents
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/vendors")}
              >
                <Store size={20} />
                Manage Vendors
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/settings")}
              >
                <Settings size={20} />
                System Settings
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/database")}
              >
                <Database size={20} />
                Database Management
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/blockchain")}
              >
                <Coins size={20} />
                Blockchain Settings
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/coins")}
              >
                <Coins size={20} />
                Coin Management
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/conversion-fees")}
              >
                <ArrowRightLeft size={20} />
                Conversion Fees
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/features")}
              >
                <ToggleLeft size={20} />
                Feature Toggles
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/print-qr")}
              >
                <QrCode size={20} />
                Print User QR Codes
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/notifications")}
              >
                <Bell size={20} />
                Send Notifications
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant={aiSummary.critical > 0 ? "destructive" : "secondary"}
                onClick={() => navigate("/admin/ai-security")}
                data-testid="button-ai-security"
              >
                <Brain size={20} />
                AI Security Center
                {aiSummary.critical > 0 && (
                  <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded">
                    {aiSummary.critical} critical
                  </span>
                )}
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/firewall")}
                data-testid="button-firewall"
              >
                <ShieldAlert size={20} />
                AI Firewall
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/rpc-node")}
                data-testid="button-rpc-node"
              >
                <Network size={20} />
                RPC Node Manager
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/litenode")}
                data-testid="button-litenode"
              >
                <Cpu size={20} />
                Litenode (Mock / Test RPC)
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/mobile-providers")}
              >
                <Smartphone size={20} />
                Mobile Money Providers
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/app-manager")}
                data-testid="button-app-manager"
              >
                <Smartphone size={20} />
                App Manager (Builds · OTA · Share)
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/apk-builder")}
                data-testid="button-apk-builder"
              >
                <Terminal size={20} />
                APK Builder (Version · RPC · Download)
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="outline"
                onClick={() => navigate("/admin/themes")}
                data-testid="button-app-themes"
              >
                <Palette size={20} />
                App Themes
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reports & Analytics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/transactions")}
              >
                <BarChart3 size={20} />
                Transaction Reports
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl" 
                variant="secondary"
                onClick={() => navigate("/admin/financial")}
              >
                <FileText size={20} />
                Financial Reports
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin/analytics")}
              >
                <Users size={20} />
                User Analytics
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial Management</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/fee-management")}
              >
                <DollarSign size={20} />
                Fee Management
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl" 
                variant="secondary"
                onClick={() => navigate("/admin/vendor-fees")}
              >
                <Store size={20} />
                Vendor Registration Fees
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/admin-deposit")}
              >
                <Wallet size={20} />
                Add Funds to Users
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                onClick={() => navigate("/approve-deposits")}
              >
                <CheckCircle size={20} />
                Approve Agent Deposits
              </Button>
              <Button 
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/reversals")}
              >
                <RotateCcw size={20} />
                Manage Fund Reversals
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/audit-logs")}
              >
                <FileText size={20} />
                Audit Logs
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/kyc-review")}
              >
                <ShieldCheck size={20} />
                KYC Review Queue
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/alerts")}
              >
                <AlertTriangle size={20} />
                Suspicious Activity Alerts
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/announcements")}
              >
                <Megaphone size={20} />
                Announcements & Ads
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/countries")}
              >
                <Globe size={20} />
                Countries (allow / ban)
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/console")}
              >
                <Terminal size={20} />
                Admin Console
              </Button>
              <Button
                className="w-full justify-start gap-3 h-14 rounded-xl"
                variant="secondary"
                onClick={() => navigate("/admin/legal")}
              >
                <Scale size={20} />
                Legal & Compliance
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminFeeWalletWidget />
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Transactions</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin/transactions")} className="text-xs">
                  View all
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentTxs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No recent transactions</p>
              ) : (
                <div className="space-y-2">
                  {recentTxs.map((t: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                          ${t.status === "completed" ? "bg-green-500/15 text-green-600" :
                            t.status === "pending" ? "bg-yellow-500/15 text-yellow-600" :
                            "bg-red-500/15 text-red-600"}`}>
                          {t.status === "completed" ? "✓" : t.status === "pending" ? "~" : "✗"}
                        </div>
                        <div>
                          <p className="text-xs font-medium">${Number(t.amount || 0).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(t.created_at).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium
                          ${t.status === "completed" ? "bg-green-500/10 text-green-700" :
                            t.status === "pending" ? "bg-yellow-500/10 text-yellow-700" :
                            "bg-red-500/10 text-red-700"}`}>
                          {t.status}
                        </span>
                        {Number(t.fee || 0) > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">fee: ${Number(t.fee).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Version & Changelog */}
        <Card className="border-dashed">
          <CardContent className="py-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Info size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    GYD App {changelog.length > 0 ? `v${changelog[0].version}` : "v1.1.0"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Built {new Date(__BUILD_TIME__).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                  {__COMMIT_HASH__}
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigate("/admin/changelog")}>
                  <Pencil size={14} />
                </Button>
              </div>
            </div>

            {changelog.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Changelog</p>
                <div className="space-y-3">
                  {changelog.map((entry) => (
                    <div key={entry.id}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">v{entry.version}</span>
                        {entry.is_latest && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Latest</span>
                        )}
                      </div>
                      <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                        {entry.items.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminDashboard;

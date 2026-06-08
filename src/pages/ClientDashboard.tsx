import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { AnnouncementCarousel } from "@/components/AnnouncementCarousel";
import { ReversalHoldBanner } from "@/components/ReversalHoldBanner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getWalletBalance } from "@/lib/wallet";
import {
  User,
  Eye,
  EyeOff,
  DollarSign,
  Plus,
  ArrowDownToLine,
  Receipt,
  Send,
  Gift,
  ArrowUpFromLine,
  Store,
  UserPlus,
  Ticket,
  MoreHorizontal,
  QrCode,
  Coins,
  Copy,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Scan,
} from "lucide-react";
import { format, startOfMonth } from "date-fns";
import { requestNotificationPermission, subscribeToTransactionNotifications } from "@/lib/pushNotifications";
import { PiggyBank, CalendarClock, Target } from "lucide-react";

interface SavingsGoal { id: string; name: string; target: number; saved: number; }
interface ScheduledPayment { id: string; label: string; amount: number; nextDate: string; }

interface WalletData {
  balance: number;
  currency: string;
}

interface ProfileData {
  full_name: string;
  wallet_address: string | null;
}

interface BlockchainSettings {
  rpc_url: string | null;
  native_coin_symbol: string;
  is_active: boolean;
}

interface FeatureToggle {
  feature_key: string;
  is_enabled: boolean;
}

const BALANCE_REFRESH_INTERVAL = 30000; // 30 seconds

const ClientDashboard = () => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showBalance, setShowBalance] = useState(true);
  const [blockchainSettings, setBlockchainSettings] = useState<BlockchainSettings | null>(null);
  const [blockchainBalance, setBlockchainBalance] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [featureToggles, setFeatureToggles] = useState<FeatureToggle[]>([]);
  const [monthIn, setMonthIn] = useState(0);
  const [monthOut, setMonthOut] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [topPayees, setTopPayees] = useState<{ id: string; name: string; total: number }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchBlockchainBalance = useCallback(async () => {
    if (!blockchainSettings?.rpc_url || !profile?.wallet_address) return;
    
    try {
      const balance = await getWalletBalance(blockchainSettings.rpc_url, profile.wallet_address);
      setBlockchainBalance(balance);
    } catch (error) {
      console.error('Error fetching blockchain balance:', error);
    }
  }, [blockchainSettings, profile]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (blockchainSettings?.is_active && blockchainSettings?.rpc_url && profile?.wallet_address) {
      fetchBlockchainBalance();
      
      // Set up auto-refresh interval
      const interval = setInterval(fetchBlockchainBalance, BALANCE_REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [blockchainSettings, profile, fetchBlockchainBalance]);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Load savings goals from localStorage
    try {
      const gs = JSON.parse(localStorage.getItem(`savings_goals_${user.id}`) || "[]");
      setSavingsGoals(gs.slice(0, 3));
    } catch { setSavingsGoals([]); }

    // Load scheduled payments from localStorage
    try {
      const sp = JSON.parse(localStorage.getItem(`scheduled_payments_${user.id}`) || "[]");
      const upcoming = sp.filter((p: any) => p.isActive !== false).slice(0, 2);
      setScheduledPayments(upcoming);
    } catch { setScheduledPayments([]); }

    // Subscribe to push notifications
    requestNotificationPermission().then(granted => {
      if (granted) subscribeToTransactionNotifications(user.id, (title, body) => {
        toast({ title, description: body });
      });
    });

    const [walletRes, profileRes, blockchainRes, featuresRes] = await Promise.all([
      supabase.from("wallets").select("*").eq("user_id", user.id).single(),
      supabase.from("profiles").select("full_name, wallet_address").eq("id", user.id).single(),
      supabase.from("blockchain_settings").select("rpc_url, native_coin_symbol, is_active").single(),
      supabase.from("feature_toggles").select("feature_key, is_enabled"),
    ]);

    if (walletRes.data) setWallet(walletRes.data);
    if (profileRes.data) setProfile(profileRes.data);
    if (blockchainRes.data) setBlockchainSettings(blockchainRes.data);
    if (featuresRes.data) setFeatureToggles(featuresRes.data);

    // This-month income/spending + recent + top payees
    const monthStart = startOfMonth(new Date()).toISOString();
    const { data: txMonth } = await supabase
      .from("transactions")
      .select("id, amount, transaction_type, status, description, created_at, sender_id, receiver_id")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false });

    if (txMonth) {
      let inc = 0;
      let out = 0;
      const payeeMap = new Map<string, number>();
      txMonth.forEach((t: any) => {
        if (t.status !== "completed") return;
        if (t.receiver_id === user.id) inc += Number(t.amount || 0);
        if (t.sender_id === user.id) {
          out += Number(t.amount || 0);
          payeeMap.set(t.receiver_id, (payeeMap.get(t.receiver_id) || 0) + Number(t.amount || 0));
        }
      });
      setMonthIn(inc);
      setMonthOut(out);
      setMonthCount(txMonth.length);
      setRecentTx(txMonth.slice(0, 4));

      const payeeIds = Array.from(payeeMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);
      if (payeeIds.length > 0) {
        const { data: payeeProfiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", payeeIds);
        if (payeeProfiles) {
          const arr = payeeIds.map((id) => ({
            id,
            name: payeeProfiles.find((p: any) => p.id === id)?.full_name || "User",
            total: payeeMap.get(id) || 0,
          }));
          setTopPayees(arr);
        }
      } else {
        setTopPayees([]);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchBlockchainBalance()]);
    setRefreshing(false);
    toast({ title: "Balance refreshed" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  const copyAddress = async () => {
    if (profile?.wallet_address) {
      await navigator.clipboard.writeText(profile.wallet_address);
      toast({ title: "Wallet address copied" });
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isFeatureEnabled = (featureKey: string) => {
    const feature = featureToggles.find(f => f.feature_key === featureKey);
    return feature?.is_enabled ?? false;
  };

  const services = useMemo(() => {
    const allServices = [
      { icon: Receipt, label: "Pay Bills", path: "/pay-bills", featureKey: "pay_bills" },
      { icon: Send, label: "Send Money", path: "/send-money", featureKey: null },
      { icon: Gift, label: "Request Funds", path: "/request-funds", featureKey: null },
      { icon: RotateCcw, label: "Reverse Funds", path: "/request-reversal", featureKey: null },
      { icon: ArrowUpFromLine, label: "Top-up", path: "/top-up", featureKey: "top_up" },
      { icon: Store, label: "Pay Merchant", path: "/pay-merchant", featureKey: "pay_merchant" },
      { icon: Store, label: "Shop", path: "/vendors", featureKey: null },
      { icon: UserPlus, label: "Refer & Earn", path: "/refer", featureKey: null },
      { icon: Ticket, label: "Transactions", path: "/transactions", featureKey: null },
    ];

    return allServices.filter(service => 
      service.featureKey === null || isFeatureEnabled(service.featureKey)
    );
  }, [featureToggles]);

  return (
    <div className="min-h-screen bg-primary/10">
      {/* Header */}
      <header className="bg-primary p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-0.5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="w-2 h-2 bg-foreground rounded-full" />
            ))}
          </div>
          <span className="font-bold text-foreground">GYD</span>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <button
            onClick={() => navigate("/profile")}
            className="w-10 h-10 bg-card rounded-full flex items-center justify-center"
          >
            <User size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-6 pb-32">
        <ReversalHoldBanner />
        <AnnouncementCarousel />
        {/* Wallet Card */}
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-card-stripe-1 via-card-stripe-2 to-card-stripe-3 blur-xl opacity-50" />
          <div className="relative bg-primary rounded-3xl p-6 shadow-card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-foreground/80 mb-1">
                  Hi {profile?.full_name || "User"}
                </p>
                <p className="text-xs text-foreground/60">{getGreeting()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  className="text-foreground"
                  disabled={refreshing}
                >
                  <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  className="text-foreground"
                >
                  {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
              </div>
            </div>
            {/* Primary Balance - On-Chain GYD (Source of Truth) */}
            {blockchainSettings?.is_active && profile?.wallet_address ? (
              <div className="mt-4">
                <h2 className="text-5xl font-bold text-foreground">
                  {showBalance
                    ? `${blockchainBalance || '0'} ${blockchainSettings.native_coin_symbol}`
                    : "****"}
                </h2>
                <p className="text-sm text-foreground/70 mt-1">On-Chain Balance</p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="text-xs text-foreground/60 bg-foreground/10 px-2 py-1 rounded">
                    {truncateAddress(profile.wallet_address)}
                  </code>
                  <button onClick={copyAddress} className="text-foreground/60 hover:text-foreground">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <h2 className="text-5xl font-bold text-foreground">
                  {showBalance
                    ? `$${wallet?.balance?.toFixed(2) || "0.00"}`
                    : "****"}
                </h2>
                <p className="text-sm text-foreground/70 mt-1">Main Wallet</p>
              </div>
            )}

            {/* Secondary: Internal Ledger Balance (for reference only) */}
            {blockchainSettings?.is_active && wallet && (
              <div className="mt-4 pt-4 border-t border-foreground/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins size={16} className="text-foreground/70" />
                    <span className="text-sm text-foreground/70">
                      Internal Ledger
                    </span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">
                    {showBalance
                      ? `$${wallet?.balance?.toFixed(2) || "0.00"}`
                      : "****"}
                  </span>
                </div>
                <p className="text-xs text-foreground/50 mt-1">
                  Reference only - On-chain balance is your actual balance
                </p>
              </div>
            )}
          </div>
        </div>

        {/* This Month Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card rounded-2xl p-3 shadow-soft" data-testid="stat-month-in">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
              <TrendingUp size={12} className="text-green-600" /> Income
            </div>
            <div className="text-base font-bold text-green-600">${monthIn.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">{format(new Date(), "MMM yyyy")}</div>
          </div>
          <div className="bg-card rounded-2xl p-3 shadow-soft" data-testid="stat-month-out">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
              <TrendingDown size={12} className="text-red-600" /> Spent
            </div>
            <div className="text-base font-bold text-red-600">${monthOut.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">{monthCount} txs</div>
          </div>
          <div className="bg-card rounded-2xl p-3 shadow-soft" data-testid="stat-month-net">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1">
              <DollarSign size={12} /> Net
            </div>
            <div className={`text-base font-bold ${monthIn - monthOut >= 0 ? "text-green-600" : "text-red-600"}`}>
              {monthIn - monthOut >= 0 ? "+" : "-"}${Math.abs(monthIn - monthOut).toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">this month</div>
          </div>
        </div>

        {/* Savings Goals widget */}
        {savingsGoals.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <PiggyBank size={14} className="text-pink-500" /> Savings Goals
              </h3>
              <button onClick={() => navigate("/savings")} className="text-xs text-primary">Manage →</button>
            </div>
            <div className="space-y-2">
              {savingsGoals.map(g => {
                const pct = Math.min((g.saved / g.target) * 100, 100);
                return (
                  <div key={g.id} className="bg-card rounded-2xl p-3 shadow-soft">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold truncate max-w-[180px]">{g.name}</span>
                      <span className="text-xs text-muted-foreground">${g.saved.toFixed(0)} / ${g.target.toFixed(0)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">{pct.toFixed(0)}% saved</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduled Payments reminder */}
        {scheduledPayments.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <CalendarClock size={14} className="text-blue-500" /> Upcoming Payments
              </h3>
              <button onClick={() => navigate("/scheduled-payments")} className="text-xs text-primary">View all →</button>
            </div>
            <div className="bg-card rounded-2xl divide-y divide-border overflow-hidden shadow-soft">
              {scheduledPayments.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0">
                    <CalendarClock size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.label}</div>
                    <div className="text-[11px] text-muted-foreground">Next: {p.nextDate}</div>
                  </div>
                  <div className="text-sm font-bold text-foreground">${Number(p.amount).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial health mini-bar */}
        {monthIn + monthOut > 0 && (
          <div className="bg-card rounded-2xl p-3 shadow-soft">
            <div className="flex items-center gap-2 mb-2">
              <Target size={14} className="text-green-600" />
              <span className="text-xs font-semibold text-foreground">Financial Health</span>
              <span className="ml-auto text-xs font-bold text-green-600">
                {monthIn > 0 ? Math.round(Math.min(((monthIn - monthOut) / monthIn) * 100, 100)) : 0}% saved
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                style={{ width: `${monthIn > 0 ? Math.max(Math.min(((monthIn - monthOut) / monthIn) * 100, 100), 0) : 0}%` }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Saved ${Math.max(monthIn - monthOut, 0).toFixed(2)} out of ${monthIn.toFixed(2)} earned this month
            </div>
          </div>
        )}

        {/* Frequent recipients */}
        {topPayees.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-foreground">Pay again</h3>
              <button
                onClick={() => navigate("/send-money")}
                className="text-xs text-primary"
                data-testid="link-send-other"
              >
                Pay someone new →
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {topPayees.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate("/send-money")}
                  className="flex-shrink-0 flex flex-col items-center gap-1 w-16"
                  data-testid={`payee-${p.id}`}
                >
                  <div className="w-12 h-12 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-[11px] text-foreground truncate w-full text-center">
                    {p.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {recentTx.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-foreground">Recent activity</h3>
              <button
                onClick={() => navigate("/transactions")}
                className="text-xs text-primary"
                data-testid="link-all-tx"
              >
                See all →
              </button>
            </div>
            <div className="bg-card rounded-2xl divide-y divide-border overflow-hidden shadow-soft">
              {recentTx.map((t: any) => {
                const out = t.sender_id === userId;
                return (
                  <button
                    key={t.id}
                    onClick={() => navigate("/transactions")}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition text-left"
                    data-testid={`recent-${t.id}`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${out ? "bg-red-500/15 text-red-600" : "bg-green-500/15 text-green-600"}`}>
                      {out ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.description || (out ? "Sent" : "Received")}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(new Date(t.created_at), "MMM d · HH:mm")}
                      </div>
                    </div>
                    <div className={`text-sm font-bold ${out ? "text-red-600" : "text-green-600"}`}>
                      {out ? "-" : "+"}${Number(t.amount).toFixed(2)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick safety chip */}
        <button
          onClick={() => navigate("/profile")}
          className="w-full bg-card border border-primary/20 rounded-2xl p-3 flex items-center gap-3 hover:bg-primary/5 transition text-left"
          data-testid="link-security"
        >
          <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <ShieldCheck size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Account security</div>
            <div className="text-[11px] text-muted-foreground">PIN, biometrics, WhatsApp verify, sign-out everywhere</div>
          </div>
          <span className="text-xs text-primary">Open →</span>
        </button>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button 
            onClick={() => navigate("/send-money")}
            className="flex-1 h-16 rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2"
          >
            <DollarSign size={20} />
            Pay
          </Button>
          <Button 
            onClick={() => navigate("/add-money")}
            className="flex-1 h-16 rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2"
          >
            <Plus size={20} />
            Add
          </Button>
          <Button 
            onClick={() => navigate("/receive-money")}
            className="flex-1 h-16 rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2"
          >
            <ArrowDownToLine size={20} />
            Receive
          </Button>
        </div>

        {/* Services Grid */}
        <div>
          <h3 className="text-xl font-bold text-foreground mb-4">Services</h3>
          <div className="grid grid-cols-4 gap-4">
            {services.map((service, index) => (
              <button
                key={index}
                onClick={() => service.path && navigate(service.path)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-muted/50 transition-colors"
              >
                <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center">
                  <service.icon className="text-foreground" size={24} />
                </div>
                <span className="text-xs text-center text-foreground font-medium">
                  {service.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-secondary border-t border-border">
        <div className="flex items-center justify-around p-4">
          <button onClick={() => navigate("/client")} className="text-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 0 0 .707-1.707l-9-9a.999.999 0 0 0-1.414 0l-9 9A1 1 0 0 0 3 13z"/>
            </svg>
          </button>
          <button onClick={() => navigate("/transactions")} className="text-muted-foreground">
            <Receipt size={24} />
          </button>
          <button 
            onClick={() => navigate("/scan-to-pay")}
            className="w-16 h-16 -mt-8 bg-primary rounded-full flex items-center justify-center shadow-lg"
          >
            <QrCode size={28} className="text-foreground" />
          </button>
          <button onClick={() => navigate("/feedback")} className="text-muted-foreground">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
          <button onClick={() => navigate("/menu")} className="text-muted-foreground">
            <MoreHorizontal size={24} />
          </button>
        </div>
        <div className="text-center text-xs text-primary pb-2">
          Scan to Pay
        </div>
      </nav>
    </div>
  );
};

export default ClientDashboard;

import { useCallback, useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import bankImage from "@/assets/neon-bank.jpg";
import { DashboardSwitcher } from "@/components/DashboardSwitcher";
import { Home, Wallet, CreditCard, Settings, HelpCircle, LogOut, ChevronRight, Landmark, Smartphone, ArrowRight } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { AnnouncementCarousel } from "@/components/AnnouncementCarousel";
import { ReversalHoldBanner } from "@/components/ReversalHoldBanner";
import { OnChainBalanceCard } from "@/components/OnChainBalanceCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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
import { requestNotificationPermission, subscribeToTransactionNotifications, subscribeToChatNotifications } from "@/lib/pushNotifications";
import { PiggyBank, CalendarClock, Target } from "lucide-react";
import { fetchFeatureToggles } from "@/lib/featureToggles";
import { fetchCurrentUserFeatureAccess } from "@/lib/userFeatureAccess";
import {
  legacySavingsGoalsStorageKey,
  savingsGoalsStorageKey,
} from "@/lib/savingsGoalsStorage";

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

interface FeatureToggle {
  feature_key: string;
  is_enabled: boolean;
}

const BALANCE_REFRESH_INTERVAL = 5000; // 5 seconds

const ClientDashboard = () => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletLoadError, setWalletLoadError] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showBalance, setShowBalance] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featureToggles, setFeatureToggles] = useState<FeatureToggle[]>([]);
  const [userFeatureAccess, setUserFeatureAccess] = useState<Record<string, boolean>>({});
  const [monthIn, setMonthIn] = useState(0);
  const [monthOut, setMonthOut] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [pendingOut, setPendingOut] = useState(0);
  const [pendingIn, setPendingIn] = useState(0);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [topPayees, setTopPayees] = useState<{ id: string; name: string; total: number }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchWalletBalance = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setWalletLoadError(true);
        return;
      }

      const response = await fetch("/api/auth/my-wallet-balance", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.wallet) {
        setWallet(result.wallet as WalletData);
        setWalletLoadError(false);
        return;
      }

      // Keep the owner-scoped browser read as a fallback for offline/mobile
      // builds where the same-origin API may not be reachable.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(result.error || "Sign-in required.");
      const { data, error } = await supabase
        .from("wallets")
        .select("balance, currency")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      setWallet(data);
      setWalletLoadError(!data);
    } catch (error) {
      console.error("Could not refresh the internal ledger balance:", error);
      setWalletLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => void fetchWalletBalance();
    const interval = window.setInterval(refresh, BALANCE_REFRESH_INTERVAL);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [userId, fetchWalletBalance]);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    // Load savings goals from localStorage
    try {
      const currentKey = savingsGoalsStorageKey(user.id);
      const legacyKey = legacySavingsGoalsStorageKey(user.id);
      const current = localStorage.getItem(currentKey);
      const legacy = localStorage.getItem(legacyKey);
      const raw = current ?? legacy;
      if (!current && legacy) {
        localStorage.setItem(currentKey, legacy);
      }
      const gs = JSON.parse(raw || "[]");
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
      if (granted) {
        subscribeToTransactionNotifications(user.id, (title, body) => {
          toast({ title, description: body });
        });
        subscribeToChatNotifications(user.id, (senderName, text) => {
          toast({ title: `💬 ${senderName}`, description: text });
        });
      }
    });

    const [, profileRes] = await Promise.all([
      fetchWalletBalance(),
      supabase.from("profiles").select("full_name, wallet_address").eq("id", user.id).single(),
    ]);
    const [features, access] = await Promise.all([
      fetchFeatureToggles().catch(() => []),
      fetchCurrentUserFeatureAccess().catch(() => ({})),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    setFeatureToggles(features);
    setUserFeatureAccess(access);

    // This-month income/spending + recent + top payees
    const monthStart = startOfMonth(new Date()).toISOString();
    const { data: txMonth } = await supabase
      .from("transactions")
      .select("id, amount, transaction_type, status, description, created_at, sender_id, receiver_id")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false });

    // Pending transactions (all time — affects available balance)
    const { data: pendingTxData } = await supabase
      .from("transactions")
      .select("amount, sender_id, receiver_id")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .eq("status", "pending");
    if (pendingTxData) {
      let pOut = 0, pIn = 0;
      pendingTxData.forEach((t: any) => {
        if (t.sender_id === user.id) pOut += Number(t.amount || 0);
        if (t.receiver_id === user.id) pIn += Number(t.amount || 0);
      });
      setPendingOut(pOut);
      setPendingIn(pIn);
    }

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
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Live sync: refresh whenever this user's ledger wallet or transactions change
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`ledger-sync-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` },
        () => fetchWalletBalance(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `sender_id=eq.${userId}` },
        () => fetchData(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `receiver_id=eq.${userId}` },
        () => fetchData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchData, fetchWalletBalance]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast({ title: "Balance refreshed" });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const isFeatureEnabled = (featureKey: string) => {
    const feature = featureToggles.find(f => f.feature_key === featureKey);
    return feature?.is_enabled ?? false;
  };

  const services = useMemo(() => {
    const allServices = [
      { icon: Receipt, label: "Pay Bills", path: "/pay-bills", featureKey: "pay_bills", accessKey: "client_menu_pay_bills" },
      { icon: Send, label: "Send Money", path: "/send-money", featureKey: null, accessKey: "client_menu_send_money" },
      { icon: Gift, label: "Request Funds", path: "/request-funds", featureKey: "internal_funds", accessKey: "client_menu_request_funds" },
      { icon: RotateCcw, label: "Reverse Funds", path: "/request-reversal", featureKey: null, accessKey: "client_menu_reverse_funds" },
      { icon: ArrowUpFromLine, label: "Top-up", path: "/top-up", featureKey: "top_up", accessKey: "client_menu_top_up" },
      { icon: Store, label: "Pay Merchant", path: "/pay-merchant", featureKey: "pay_merchant", accessKey: "client_menu_pay_merchant" },
      { icon: Store, label: "Shop", path: "/vendors", featureKey: null, accessKey: "client_menu_shop" },
      { icon: UserPlus, label: "Refer & Earn", path: "/refer", featureKey: null, accessKey: "client_menu_refer" },
      { icon: Ticket, label: "Transactions", path: "/transactions", featureKey: null, accessKey: "client_menu_transactions" },
    ];

    return allServices.filter(service => 
      (service.featureKey === null || isFeatureEnabled(service.featureKey)) &&
      userFeatureAccess[service.accessKey] !== false
    );
  }, [featureToggles, userFeatureAccess]);

  const money = (value: number) => `${wallet?.currency || "USD"} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const balanceText = showBalance ? walletLoadError || !wallet ? "Unavailable" : money(Number(wallet.balance)) : "••••••";
  const navItems = [
    { icon: Home, label: "Dashboard", path: "/client" },
    { icon: Wallet, label: "Accounts", path: "/multi-wallet" },
    { icon: Send, label: "Send Money", path: "/send-money", accessKey: "client_menu_send_money" },
    { icon: Receipt, label: "Pay Bills", path: "/pay-bills", feature: "pay_bills", accessKey: "client_menu_pay_bills" },
    { icon: Smartphone, label: "Top-up", path: "/top-up", feature: "top_up", accessKey: "client_menu_top_up" },
    { icon: CreditCard, label: "Cards", path: "/virtual-cards" },
    { icon: Gift, label: "Rewards", path: "/rewards" },
    { icon: Settings, label: "Settings", path: "/profile" },
    { icon: HelpCircle, label: "Support", path: "/support" },
  ].filter(item => (!item.feature || isFeatureEnabled(item.feature)) && (!item.accessKey || userFeatureAccess[item.accessKey] !== false));
  const totalActivity = monthIn + monthOut;
  const spendingShare = totalActivity > 0 ? monthOut / totalActivity : 0;

  return (
    <div className="banking-dashboard min-h-screen">
      <header className="flex min-h-24 items-center justify-between gap-3 border-b border-border px-4 py-4 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Landmark className="banking-glow h-10 w-10 shrink-0 text-primary lg:h-12 lg:w-12" />
          <div className="min-w-0">
            <p className="text-xl font-bold sm:text-2xl">NetLife <span className="text-primary">Cash</span></p>
            <p className="text-xs text-muted-foreground">Virtual Banking System</p>
          </div>
        </div>
        <p className="hidden text-sm italic text-primary xl:block">Bank Smart. Live Better.</p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DashboardSwitcher banking />
          <NotificationBell />
          <Button variant="ghost" className="h-11 gap-3 px-1 sm:px-2" onClick={() => navigate("/profile")} aria-label="Open profile">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-secondary text-primary font-bold">{profile?.full_name?.charAt(0).toUpperCase() || <User size={20} />}</span>
            <span className="hidden max-w-40 truncate text-left text-sm md:block">{profile?.full_name || "My account"}<span className="block text-xs font-normal text-muted-foreground">Personal banking</span></span>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-96px)] flex-col justify-between border-r border-border px-4 py-6 lg:flex">
          <nav aria-label="Banking navigation" className="space-y-2">
            {navItems.map(item => <Button key={item.path} onClick={() => navigate(item.path)} variant={item.path === "/client" ? "default" : "ghost"} className="h-11 w-full justify-start gap-3 text-sm"><item.icon size={19} />{item.label}</Button>)}
            <Button variant="ghost" onClick={handleLogout} className="h-11 w-full justify-start gap-3"><LogOut size={19} />Logout</Button>
          </nav>
          <div className="mt-12 border-t border-border pt-5 text-center">
            <ShieldCheck size={38} className="mx-auto mb-3 text-success" />
            <p className="text-xs font-semibold">Account security</p>
            <p className="mt-1 text-xs text-muted-foreground">Powered by GYDSchain</p>
            <Button variant="link" className="mt-2 text-xs" onClick={() => navigate("/security")}>Security settings <ChevronRight size={12} /></Button>
          </div>
        </aside>

        <main className="min-w-0 space-y-5 px-4 py-5 pb-44 sm:px-6 lg:pb-24 lg:pt-6">
          <ReversalHoldBanner />
          <AnnouncementCarousel />
          <section className="relative isolate min-h-48 overflow-hidden sm:min-h-52" aria-label="Welcome">
            <img src={bankImage} width={1536} height={640} alt="Illuminated cyan digital bank" className="absolute inset-0 -z-10 h-full w-full object-cover object-right" />
            <div className="max-w-[65%] py-8 pl-2 sm:pl-6">
              <p className="mb-2 text-xs font-semibold uppercase text-primary">{getGreeting()}</p>
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">Welcome back, {profile?.full_name?.split(" ")[0] || "there"}!</h1>
              <p className="mt-3 max-w-60 text-sm text-muted-foreground">Your money. Your possibilities.</p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Account totals">
            <div className="banking-stat col-span-2 rounded-lg border border-border bg-card p-5 shadow-soft sm:col-span-1">
              <div className="flex items-center justify-between gap-2 text-muted-foreground"><span className="flex items-center gap-2 text-xs"><Wallet size={18} className="text-primary" />Wallet balance</span><div className="flex"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Refresh wallet balance" onClick={handleRefresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /></Button><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={showBalance ? "Hide balance" : "Show balance"} onClick={() => setShowBalance(!showBalance)}>{showBalance ? <Eye size={15} /> : <EyeOff size={15} />}</Button></div></div>
              <p className="mt-3 break-words text-2xl font-bold" data-testid="personal-wallet-balance">{balanceText}</p>
              <p className="mt-2 text-xs text-muted-foreground">Internal ledger</p>
              {walletLoadError && <p className="mt-2 text-xs text-destructive" role="status">Could not load your balance.</p>}
            </div>
            <div className="banking-stat banking-stat-success rounded-lg border border-border bg-card p-5" data-testid="stat-month-in"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowDownToLine size={18} className="text-success" />Money received</p><p className="mt-5 break-words text-xl font-bold text-success">{showBalance ? money(monthIn) : "••••••"}</p><p className="mt-2 text-xs text-muted-foreground">{format(new Date(), "MMMM yyyy")}</p></div>
            <div className="banking-stat banking-stat-destructive rounded-lg border border-border bg-card p-5" data-testid="stat-month-out"><p className="flex items-center gap-2 text-xs text-muted-foreground"><ArrowUpFromLine size={18} className="text-destructive" />Money sent</p><p className="mt-5 break-words text-xl font-bold">{showBalance ? money(monthOut) : "••••••"}</p><p className="mt-2 text-xs text-muted-foreground">{monthCount} transactions this month</p></div>
            <div className="banking-stat banking-stat-warning rounded-lg border border-border bg-card p-5"><p className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock size={18} className="text-warning" />Pending outgoing</p><p className="mt-5 break-words text-xl font-bold text-warning">{showBalance ? money(pendingOut) : "••••••"}</p><p className="mt-2 text-xs text-muted-foreground">{showBalance ? money(pendingIn) : "••••••"} incoming</p></div>
          </section>

          <section aria-label="Quick actions" className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { icon: Send, label: "Send Money", path: "/send-money", access: "client_menu_send_money" },
              { icon: ArrowDownToLine, label: "Receive", path: "/receive-money", access: "client_menu_receive_money" },
              { icon: CreditCard, label: "Cards", path: "/virtual-cards", access: "" },
              { icon: QrCode, label: "Scan & Pay", path: "/scan-to-pay", access: "client_menu_scan_to_pay" },
            ].filter(item => !item.access || userFeatureAccess[item.access] !== false).map(item => <Button key={item.path} variant="outline" onClick={() => navigate(item.path)} className="h-24 min-w-0 flex-col gap-3 border-border bg-card px-1 text-xs hover:border-primary hover:bg-secondary"><item.icon size={26} className="banking-glow text-primary" /><span className="whitespace-normal text-center">{item.label}</span></Button>)}
          </section>

          <div className="grid gap-5 xl:grid-cols-[1fr_1fr_.85fr]">
            <section className="min-w-0 border-t border-border pt-4">
              <div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Account overview</h2><Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate("/multi-wallet")}>View all <ArrowRight size={13} /></Button></div>
              <Button variant="ghost" className="mb-3 h-auto w-full justify-between gap-3 px-0 py-3" onClick={() => navigate("/transactions")}><span className="flex min-w-0 items-center gap-3"><Wallet className="text-primary" size={24} /><span className="text-left text-sm">Personal wallet<span className="block text-xs font-normal text-muted-foreground">{wallet?.currency || "—"} account</span></span></span><span className="break-words text-right text-sm">{balanceText}</span></Button>
              <OnChainBalanceCard walletAddress={profile?.wallet_address || null} showBalance={showBalance} />
            </section>
            <section className="border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2"><h2 className="font-bold">Money overview</h2><span className="text-xs text-muted-foreground">{format(new Date(), "MMM yyyy")}</span></div>
              <div className="mt-6 flex items-center justify-center gap-5">
                <div className="relative h-32 w-32 shrink-0">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-label="Monthly sent and received proportions"><circle cx="60" cy="60" r="48" fill="none" strokeWidth="13" className="banking-chart-track" />{totalActivity > 0 && <><circle cx="60" cy="60" r="48" fill="none" strokeWidth="13" className="banking-chart-income" /><circle cx="60" cy="60" r="48" fill="none" strokeWidth="13" strokeDasharray={`${spendingShare * 301.6} 301.6`} className="banking-chart-spending" /></>}</svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold">{showBalance ? `${Math.round(spendingShare * 100)}%` : "•••"}</span><span className="text-xs text-muted-foreground">Sent</span></div>
                </div>
                <div className="space-y-4 text-xs"><p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" />Sent <strong>{showBalance ? `${Math.round(spendingShare * 100)}%` : "•••"}</strong></p><p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success" />Received <strong>{showBalance ? `${totalActivity ? Math.round((1 - spendingShare) * 100) : 0}%` : "•••"}</strong></p></div>
              </div>
              {totalActivity === 0 && <p className="mt-3 text-center text-xs text-muted-foreground">No completed activity this month.</p>}
            </section>
            <section className="flex flex-col items-start border-t border-border pt-4">
              <PiggyBank size={35} className="mb-4 text-primary" /><h2 className="text-xl font-bold">Grow your savings</h2><p className="mt-2 text-sm text-muted-foreground">{savingsGoals.length ? `${savingsGoals.length} savings goals in progress` : "Every goal starts with a little."}</p>
              {savingsGoals.slice(0, 2).map(goal => <div key={goal.id} className="mt-3 w-full"><p className="flex justify-between gap-2 text-xs"><span className="truncate">{goal.name}</span><span>{showBalance ? money(goal.saved) : "••••"}</span></p><progress className="mt-2 h-1 w-full accent-primary" value={goal.saved} max={goal.target || 1} /></div>)}
              <Button className="mt-5 gap-2" onClick={() => navigate("/savings")}>My savings <ArrowRight size={16} /></Button>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.8fr_1fr]">
            <section className="min-w-0 border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-bold">Recent transactions</h2><Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate("/transactions")}>View all <ArrowRight size={14} /></Button></div>
              {recentTx.length === 0 ? <p className="py-8 text-sm text-muted-foreground">No transactions this month.</p> : <div className="divide-y divide-border">{recentTx.map(t => {
                const outgoing = t.sender_id === userId;
                return <Button key={t.id} variant="ghost" onClick={() => navigate("/transactions")} className="h-auto w-full justify-start gap-3 rounded-none px-0 py-3 text-left"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${outgoing ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>{outgoing ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm">{t.description || (outgoing ? "Money sent" : "Money received")}</span><span className="block text-xs font-normal text-muted-foreground">{format(new Date(t.created_at), "MMM d, yyyy · HH:mm")} · {t.status}</span></span><span className={`shrink-0 text-xs font-bold sm:text-sm ${outgoing ? "text-destructive" : "text-success"}`}>{showBalance ? `${outgoing ? "−" : "+"}${Number(t.amount).toFixed(2)}` : "••••"}</span></Button>;
              })}</div>}
            </section>
            <section className="border-t border-border pt-4">
              <div className="flex items-center gap-4"><ShieldCheck className="h-12 w-12 shrink-0 text-success" /><div><h2 className="font-bold">Account security</h2><p className="mt-1 text-sm text-muted-foreground">Your personal account</p></div></div>
              <Button variant="link" className="mt-4 px-0" onClick={() => navigate("/security")}>Review security <ChevronRight size={15} /></Button>
              {scheduledPayments.length > 0 && <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">Upcoming payments</h3>{scheduledPayments.map(payment => <Button key={payment.id} variant="ghost" onClick={() => navigate("/scheduled-payments")} className="h-auto w-full justify-between gap-2 px-0 py-3"><span className="min-w-0 text-left"><span className="block truncate text-xs">{payment.label}</span><span className="text-xs font-normal text-muted-foreground">{payment.nextDate}</span></span><span className="text-xs">{showBalance ? money(Number(payment.amount)) : "•••"}</span></Button>)}</div>}
            </section>
          </div>

          {topPayees.length > 0 && <section className="border-t border-border pt-4"><h2 className="mb-4 font-bold">Pay again</h2><div className="flex flex-wrap gap-3">{topPayees.map(payee => <Button key={payee.id} variant="outline" onClick={() => navigate("/send-money")} className="gap-2"><User size={15} />{payee.name}</Button>)}</div></section>}
          <section className="border-t border-border pt-4"><h2 className="mb-4 font-bold">Services</h2><div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{services.map(service => <Button key={service.path} variant="ghost" onClick={() => navigate(service.path)} className="h-20 min-w-0 flex-col gap-2 px-1 text-xs"><service.icon size={22} className="text-primary" /><span className="whitespace-normal text-center">{service.label}</span></Button>)}</div></section>
        </main>
      </div>
      <nav aria-label="Mobile banking navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-center px-1 py-2">
          {[
            { icon: Home, label: "Home", path: "/client" },
            { icon: Wallet, label: "Accounts", path: "/multi-wallet" },
            { icon: QrCode, label: "Scan & Pay", path: "/scan-to-pay", access: "client_menu_scan_to_pay" },
            { icon: Gift, label: "Rewards", path: "/rewards" },
            { icon: Settings, label: "Settings", path: "/profile" },
          ].map(item => <Button key={item.path} variant="ghost" disabled={Boolean(item.access && userFeatureAccess[item.access] === false)} onClick={() => navigate(item.path)} className={`h-16 flex-col gap-1 px-0 text-[10px] ${item.path === "/client" ? "text-primary" : "text-muted-foreground"}`}><span className={item.path === "/scan-to-pay" ? "banking-glow -mt-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary bg-secondary text-primary" : ""}><item.icon size={23} /></span>{item.label}</Button>)}
        </div>
      </nav>
    </div>
  );
};

export default ClientDashboard;

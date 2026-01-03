import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getWalletBalance } from "@/lib/wallet";
import {
  Bell,
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
  Import,
} from "lucide-react";

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
      { icon: ArrowUpFromLine, label: "Top-up", path: "/top-up", featureKey: "top_up" },
      { icon: Store, label: "Pay Merchant", path: "/pay-merchant", featureKey: "pay_merchant" },
      { icon: UserPlus, label: "Refer & Earn", path: "/refer", featureKey: null },
      { icon: Ticket, label: "Transactions", path: "/transactions", featureKey: null },
      { icon: Import, label: "Import Wallet", path: "/wallet-import", featureKey: null },
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
          <span className="font-bold text-foreground">mmg</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/notifications")}
            className="relative"
          >
            <Bell className="text-foreground" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white text-xs rounded-full flex items-center justify-center">
              1
            </span>
          </button>
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
            <div className="mt-4">
              <h2 className="text-5xl font-bold text-foreground">
                {showBalance
                  ? `$${wallet?.balance?.toFixed(2) || "0.00"}`
                  : "****"}
              </h2>
              <p className="text-sm text-foreground/70 mt-1">Main Wallet</p>
            </div>

            {/* Blockchain Balance */}
            {blockchainSettings?.is_active && profile?.wallet_address && (
              <div className="mt-4 pt-4 border-t border-foreground/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins size={16} className="text-foreground/70" />
                    <span className="text-sm text-foreground/70">
                      {blockchainSettings.native_coin_symbol} Balance
                    </span>
                  </div>
                  <span className="text-lg font-semibold text-foreground">
                    {showBalance
                      ? `${blockchainBalance || '0'} ${blockchainSettings.native_coin_symbol}`
                      : "****"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <code className="text-xs text-foreground/60 bg-foreground/10 px-2 py-1 rounded">
                    {truncateAddress(profile.wallet_address)}
                  </code>
                  <button onClick={copyAddress} className="text-foreground/60 hover:text-foreground">
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

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

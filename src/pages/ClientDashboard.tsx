import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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
} from "lucide-react";

interface WalletData {
  balance: number;
  currency: string;
}

interface ProfileData {
  full_name: string;
}

const ClientDashboard = () => {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showBalance, setShowBalance] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: walletData } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", user.id)
      .single();

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    if (walletData) setWallet(walletData);
    if (profileData) setProfile(profileData);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const services = [
    { icon: Receipt, label: "Pay Bills", path: "/pay-bills" },
    { icon: Send, label: "Send Money", path: "/send-money" },
    { icon: Gift, label: "Request Funds", path: "/request-funds" },
    { icon: ArrowUpFromLine, label: "Top-up", path: "/top-up" },
    { icon: Store, label: "Pay Merchant", path: "/pay-merchant" },
    { icon: UserPlus, label: "Refer & Earn", path: "/refer" },
    { icon: Ticket, label: "Transactions", path: "/transactions" },
    { icon: QrCode, label: "My QR Code", path: "/my-qr" },
  ];

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
          <button className="relative">
            <Bell className="text-foreground" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-white text-xs rounded-full flex items-center justify-center">
              1
            </span>
          </button>
          <button
            onClick={() => navigate("/menu")}
            className="w-10 h-10 bg-card rounded-full flex items-center justify-center"
          >
            <User size={20} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 space-y-6">
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
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="text-foreground"
              >
                {showBalance ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>
            <div className="mt-4">
              <h2 className="text-5xl font-bold text-foreground">
                {showBalance
                  ? `$${wallet?.balance?.toFixed(2) || "0.00"}`
                  : "****"}
              </h2>
              <p className="text-sm text-foreground/70 mt-1">Main Wallet</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button className="flex-1 h-16 rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
            <DollarSign size={20} />
            Pay
          </Button>
          <Button className="flex-1 h-16 rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
            <Plus size={20} />
            Add
          </Button>
          <Button className="flex-1 h-16 rounded-2xl bg-secondary hover:bg-secondary/90 text-secondary-foreground gap-2">
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
          <button className="text-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 0 0 .707-1.707l-9-9a.999.999 0 0 0-1.414 0l-9 9A1 1 0 0 0 3 13z"/>
            </svg>
          </button>
          <button className="text-muted-foreground">
            <Receipt size={24} />
          </button>
          <button className="w-16 h-16 -mt-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
            <QrCode size={28} className="text-foreground" />
          </button>
          <button className="text-muted-foreground">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
          <button className="text-muted-foreground">
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

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Users, Briefcase, Shield, Settings, BarChart3, FileText, DollarSign, Wallet, CheckCircle, Database, Coins, ArrowRightLeft, ToggleLeft, Store, QrCode, Bell, RotateCcw, Smartphone, Info, Pencil } from "lucide-react";
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
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchProfile();
    fetchCounts();
  }, []);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                All registered users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeAgents}</div>
              <p className="text-xs text-muted-foreground">
                Currently active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">Healthy</div>
              <p className="text-xs text-muted-foreground">
                All systems operational
              </p>
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
                variant="secondary"
                onClick={() => navigate("/admin/mobile-providers")}
              >
                <Smartphone size={20} />
                Mobile Money Providers
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
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminFeeWalletWidget />
          
          <Card>
            <CardHeader>
              <CardTitle>Recent System Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                No recent system activity to display
              </p>
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
                  <p className="text-sm font-medium">GYD App v1.1.0</p>
                  <p className="text-xs text-muted-foreground">
                    Built {new Date(__BUILD_TIME__).toLocaleString()}
                  </p>
                </div>
              </div>
              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                {__COMMIT_HASH__}
              </span>
            </div>

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Changelog</p>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">v1.1.0</span>
                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Latest</span>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Mobile Money / USSD deposit option for unbanked users</li>
                    <li>Admin-configurable mobile money providers</li>
                    <li>Transaction history filtering by deposit type</li>
                    <li>CI/CD workflow for self-hosted deployment</li>
                    <li>Version display widget on admin dashboard</li>
                  </ul>
                </div>
                <div>
                  <span className="text-xs font-bold">v1.0.0</span>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                    <li>Initial release with wallet, transfers, deposits</li>
                    <li>Agent & vendor management</li>
                    <li>QR payments, fund requests & reversals</li>
                    <li>Biometric authentication & PIN security</li>
                    <li>Admin dashboard with fee management</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminDashboard;

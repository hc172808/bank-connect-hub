import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ArrowLeft, 
  User, 
  Lock, 
  MessageSquare, 
  HelpCircle, 
  LogOut,
  ChevronRight,
  Shield,
  Bell,
  FileCheck,
  PiggyBank,
  Users,
  CreditCard,
  BarChart3,
  TrendingUp,
  CalendarClock,
  Receipt,
  Star,
  Globe,
  UsersRound,
  Wallet,
  Briefcase,
  HeadphonesIcon,
  Trophy,
  ArrowLeftRight,
  Sparkles,
  Lightbulb,
  Wifi,
  Building2,
  Newspaper,
  Smartphone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { fetchCurrentUserFeatureAccess } from "@/lib/userFeatureAccess";

interface ProfileData {
  full_name: string | null;
  phone_number: string | null;
}

const menuSections = [
  {
    title: "Account",
    items: [
      { icon: User, label: "My Profile", path: "/profile", featureKey: "client_menu_profile" },
      { icon: Lock, label: "Change Password", path: "/change-password", featureKey: "client_menu_change_password" },
      { icon: Shield, label: "Security & 2FA", path: "/security", featureKey: "client_menu_security" },
      { icon: FileCheck, label: "Identity Verification (KYC)", path: "/kyc", featureKey: "client_menu_kyc" },
    ],
  },
  {
    title: "Financial Tools",
    items: [
      { icon: TrendingUp,    label: "Financial Insights",    path: "/insights", featureKey: "client_menu_insights" },
      { icon: BarChart3,     label: "Budget Planner",        path: "/budget", featureKey: "client_menu_budget" },
      { icon: PiggyBank,     label: "Savings Goals",         path: "/savings", featureKey: "client_menu_savings" },
      { icon: PiggyBank,     label: "Savings Accounts",      path: "/savings-accounts", featureKey: "client_menu_savings_accounts" },
      { icon: CreditCard,    label: "Loans",                  path: "/loans", featureKey: "client_menu_loans" },
      { icon: Star,          label: "Credit Builder",         path: "/credit-builder", featureKey: "client_menu_credit_builder" },
      { icon: CalendarClock, label: "Scheduled Payments",     path: "/scheduled-payments", featureKey: "client_menu_scheduled_payments" },
      { icon: Globe,         label: "International Transfer", path: "/international-transfers", featureKey: "client_menu_international_transfers" },
      { icon: UsersRound,    label: "Group Payments",         path: "/group-payments", featureKey: "client_menu_group_payments" },
      { icon: Receipt,       label: "Split Bills",            path: "/split-bills", featureKey: "client_menu_split_bills" },
      { icon: ArrowLeftRight, label: "Currency Converter",        path: "/currency-converter", featureKey: "client_menu_currency_converter" },
      { icon: Sparkles,      label: "AI Financial Assistant",     path: "/ai-assistant", featureKey: "client_menu_ai_assistant" },
      { icon: Lightbulb,     label: "Personalized Recommendations", path: "/recommendations", featureKey: "client_menu_recommendations" },
      { icon: Wifi,          label: "NFC Tap Payments",           path: "/nfc-payment", featureKey: "client_menu_nfc_payment" },
      { icon: Building2,     label: "Open Banking",               path: "/open-banking", featureKey: "client_menu_open_banking" },
      { icon: Users,         label: "Beneficiaries",              path: "/beneficiaries", featureKey: "client_menu_beneficiaries" },
      { icon: CreditCard,    label: "Virtual Cards",              path: "/virtual-cards", featureKey: "client_menu_virtual_cards" },
      { icon: Wallet,        label: "All Wallets",                path: "/multi-wallet", featureKey: "client_menu_multi_wallet" },
      { icon: TrendingUp,    label: "Investments",                path: "/investments", featureKey: "client_menu_investments" },
      { icon: Briefcase,     label: "Business Banking",           path: "/business-banking", featureKey: "client_menu_business_banking" },
      { icon: Star,          label: "Rewards",                    path: "/rewards", featureKey: "client_menu_rewards" },
    ],
  },
  {
    title: "Other",
    items: [
       { icon: Smartphone,      label: "Download App",     path: "/download-app", featureKey: "client_menu_download_app" },
       { icon: Newspaper,       label: "What's New",       path: "/whats-new", featureKey: "client_menu_whats_new" },
       { icon: Bell,            label: "Notifications",    path: "/notifications", featureKey: "client_menu_notifications" },
       { icon: MessageSquare,   label: "Messages",         path: "/chat", featureKey: "client_menu_messages" },
       { icon: HeadphonesIcon,  label: "Support Center",   path: "/support", featureKey: "client_menu_support_center" },
       { icon: Trophy,          label: "Achievements",     path: "/gamification", featureKey: "client_menu_achievements" },
       { icon: HelpCircle,      label: "Help & Support",   path: "/feedback", featureKey: "client_menu_help_support" },
       { icon: MessageSquare,   label: "Feedback",         path: "/feedback", featureKey: "client_menu_feedback" },
    ],
  },
];

const Menu = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [featureAccess, setFeatureAccess] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void Promise.all([fetchProfile(), fetchCurrentUserFeatureAccess()])
      .then(([, access]) => setFeatureAccess(access))
      .catch(() => {
        // Missing access rows or an unavailable optional endpoint should not
        // hide the existing menu.
      });
  }, []);

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone_number")
      .eq("id", user.id)
      .single();

    if (data) setProfile(data);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({ title: "Signed out successfully" });
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold">{profile?.full_name || "User"}</h2>
                <p className="text-muted-foreground">{profile?.phone_number || "No phone"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {menuSections.map((section) => (
            <Card key={section.title}>
              <CardContent className="p-2">
                <p className="text-xs font-semibold text-muted-foreground px-4 pt-2 pb-1 uppercase tracking-wide">
                  {section.title}
                </p>
                {section.items.filter((item) => featureAccess[item.featureKey] !== false).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <item.icon size={20} className="text-primary" />
                      </div>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <ChevronRight size={20} className="text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="p-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-between p-4 hover:bg-destructive/10 rounded-xl transition-colors text-destructive"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
                    <LogOut size={20} />
                  </div>
                  <span className="font-medium">Logout</span>
                </div>
                <ChevronRight size={20} />
              </button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Menu;

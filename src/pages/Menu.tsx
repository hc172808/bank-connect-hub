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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

interface ProfileData {
  full_name: string | null;
  phone_number: string | null;
}

const menuSections = [
  {
    title: "Account",
    items: [
      { icon: User, label: "My Profile", path: "/profile" },
      { icon: Lock, label: "Change Password", path: "/change-password" },
      { icon: Shield, label: "Security & 2FA", path: "/security" },
      { icon: FileCheck, label: "Identity Verification (KYC)", path: "/kyc" },
    ],
  },
  {
    title: "Financial Tools",
    items: [
      { icon: TrendingUp,    label: "Financial Insights",    path: "/insights" },
      { icon: BarChart3,     label: "Budget Planner",        path: "/budget" },
      { icon: PiggyBank,     label: "Savings Goals",         path: "/savings" },
      { icon: CalendarClock, label: "Scheduled Payments",    path: "/scheduled-payments" },
      { icon: Receipt,       label: "Split Bills",           path: "/split-bills" },
      { icon: Users,         label: "Beneficiaries",         path: "/beneficiaries" },
      { icon: CreditCard,    label: "Virtual Cards",         path: "/virtual-cards" },
    ],
  },
  {
    title: "Other",
    items: [
      { icon: Bell,         label: "Notifications",  path: "/notifications" },
      { icon: HelpCircle,   label: "Help & Support", path: "/feedback" },
      { icon: MessageSquare,label: "Feedback",       path: "/feedback" },
    ],
  },
];

const Menu = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    fetchProfile();
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
                {section.items.map((item, index) => (
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

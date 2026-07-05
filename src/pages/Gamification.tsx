import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Trophy, Star, Zap, Target, Award, Lock,
  CheckCircle, Gift, Flame, Shield, TrendingUp,
  Users, CreditCard, PiggyBank, Coins, Crown, DollarSign,
} from "lucide-react";

interface Badge {
  id: string;
  name: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  unlocked: boolean;
  xp: number;
  category: string;
}

interface Challenge {
  id: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  progress: number;
  target: number;
  xp: number;
  deadline: string;
  completed: boolean;
}

interface Level {
  level: number;
  name: string;
  minXP: number;
  color: string;
  icon: React.ElementType;
}

const LEVELS: Level[] = [
  { level: 1, name: "Starter",     minXP: 0,    color: "text-gray-600",   icon: Star },
  { level: 2, name: "Saver",       minXP: 100,  color: "text-blue-600",   icon: PiggyBank },
  { level: 3, name: "Transactor",  minXP: 250,  color: "text-green-600",  icon: CreditCard },
  { level: 4, name: "Investor",    minXP: 500,  color: "text-yellow-600", icon: TrendingUp },
  { level: 5, name: "Champion",    minXP: 1000, color: "text-orange-600", icon: Trophy },
  { level: 6, name: "Elite",       minXP: 2000, color: "text-purple-600", icon: Crown },
  { level: 7, name: "Legend",      minXP: 5000, color: "text-red-600",    icon: Flame },
];

const STORAGE_KEY = "vbank_gamification_v1";

const Gamification = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "badges" | "challenges">("overview");

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) {
      const saved = JSON.parse(raw);
      setXp(saved.xp); setStreak(saved.streak);
      setBadges(saved.badges); setChallenges(saved.challenges);
      setLoading(false);
      return;
    }

    // Derive from Supabase data
    const [txRes, kycRes, profileRes] = await Promise.all([
      supabase.from("transactions").select("id, amount, status, transaction_type")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq("status", "completed"),
      supabase.from("profiles").select("kyc_status, two_factor_enabled, created_at").eq("id", user.id).single(),
      supabase.from("profiles").select("referral_count").eq("id", user.id).single(),
    ]);

    const txCount = (txRes.data || []).length;
    const txTotal = (txRes.data || []).reduce((s: number, t: any) => s + (t.amount || 0), 0);
    const kycVerified = (kycRes.data as any)?.kyc_status === "approved";
    const twoFAOn = (kycRes.data as any)?.two_factor_enabled;
    const referrals = (profileRes.data as any)?.referral_count || 0;

    const computedXP = txCount * 10 + (kycVerified ? 200 : 0) + (twoFAOn ? 100 : 0) + referrals * 50;

    const computedBadges: Badge[] = [
      { id: "first_tx",    name: "First Transfer",    desc: "Complete your first transaction",          icon: CreditCard,  color: "text-blue-600",   unlocked: txCount >= 1,   xp: 20,  category: "transactions" },
      { id: "tx_10",      name: "10 Transactions",   desc: "Complete 10 transactions",                 icon: Zap,         color: "text-yellow-600", unlocked: txCount >= 10,  xp: 50,  category: "transactions" },
      { id: "tx_50",      name: "Power Sender",      desc: "Complete 50 transactions",                 icon: Flame,       color: "text-orange-600", unlocked: txCount >= 50,  xp: 150, category: "transactions" },
      { id: "kyc",        name: "Identity Verified", desc: "Complete KYC verification",                icon: Shield,      color: "text-green-600",  unlocked: kycVerified,    xp: 200, category: "security" },
      { id: "2fa",        name: "Security Pro",      desc: "Enable two-factor authentication",         icon: Shield,      color: "text-purple-600", unlocked: twoFAOn,        xp: 100, category: "security" },
      { id: "referral",   name: "Friend Maker",      desc: "Refer 1 friend to NETLIFE CASH",           icon: Users,       color: "text-pink-600",   unlocked: referrals >= 1, xp: 100, category: "social" },
      { id: "big_sender", name: "Big Spender",       desc: "Send over $1,000 total",                   icon: DollarSign,  color: "text-teal-600",   unlocked: txTotal >= 1000,xp: 200, category: "transactions" },
      { id: "saver",      name: "Saver",             desc: "Maintain $500+ balance for 7 days",        icon: PiggyBank,   color: "text-indigo-600", unlocked: false,          xp: 150, category: "savings" },
      { id: "investor",   name: "Investor",          desc: "Make your first investment",               icon: TrendingUp,  color: "text-emerald-600",unlocked: false,          xp: 200, category: "investment" },
      { id: "bill_payer", name: "Bill Payer",        desc: "Pay 3 bills using NETLIFE CASH",           icon: Target,      color: "text-cyan-600",   unlocked: false,          xp: 75,  category: "payments" },
    ];

    const computedChallenges: Challenge[] = [
      { id: "c1", title: "Daily Transaction",     desc: "Complete 1 transaction today",         icon: Zap,      progress: Math.min(txCount, 1),  target: 1,  xp: 15,  deadline: "Today",      completed: txCount >= 1 },
      { id: "c2", title: "Weekly Saver",          desc: "Make 3 transactions this week",        icon: PiggyBank,progress: Math.min(txCount, 3),  target: 3,  xp: 50,  deadline: "This week",  completed: txCount >= 3 },
      { id: "c3", title: "KYC Completion",        desc: "Complete your identity verification",  icon: Shield,   progress: kycVerified ? 1 : 0,   target: 1,  xp: 200, deadline: "Ongoing",    completed: kycVerified },
      { id: "c4", title: "Refer a Friend",        desc: "Invite 1 person to NETLIFE CASH",      icon: Users,    progress: Math.min(referrals, 1), target: 1,  xp: 100, deadline: "Ongoing",    completed: referrals >= 1 },
      { id: "c5", title: "Security Champion",     desc: "Enable 2FA on your account",           icon: Shield,   progress: twoFAOn ? 1 : 0,       target: 1,  xp: 100, deadline: "Ongoing",    completed: twoFAOn },
      { id: "c6", title: "Pay a Bill",            desc: "Pay any utility or government bill",   icon: Target,   progress: 0,                     target: 1,  xp: 30,  deadline: "This month", completed: false },
    ];

    const saved = { xp: computedXP, streak: Math.min(txCount, 7), badges: computedBadges, challenges: computedChallenges };
    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(saved));
    setXp(computedXP);
    setStreak(Math.min(txCount, 7));
    setBadges(computedBadges);
    setChallenges(computedChallenges);
    setLoading(false);
  };

  const currentLevel = [...LEVELS].reverse().find(l => xp >= l.minXP) || LEVELS[0];
  const nextLevel = LEVELS[LEVELS.indexOf(currentLevel) + 1];
  const levelProgress = nextLevel
    ? ((xp - currentLevel.minXP) / (nextLevel.minXP - currentLevel.minXP)) * 100
    : 100;

  const unlockedBadges = badges.filter(b => b.unlocked);
  const lockedBadges = badges.filter(b => !b.unlocked);
  const completedChallenges = challenges.filter(c => c.completed);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading your progress...</div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-to-br from-purple-700 to-indigo-600 text-white p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><Trophy className="h-5 w-5" /> Achievements</h1>
            <p className="text-xs text-white/70">Level up your NETLIFE CASH experience</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1"><Flame className="h-4 w-4 text-orange-300" /><span className="font-bold">{streak} day streak</span></div>
          </div>
        </div>
        {/* Level card */}
        <div className="bg-white/20 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-14 h-14 bg-white/30 rounded-2xl flex items-center justify-center">
              <currentLevel.icon className="h-8 w-8 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg">Level {currentLevel.level} — {currentLevel.name}</span>
                <span className="font-bold text-lg">{xp.toLocaleString()} XP</span>
              </div>
              <Progress value={levelProgress} className="h-2.5 mt-1 bg-white/30" />
              {nextLevel && <p className="text-xs text-white/70 mt-1">{nextLevel.minXP - xp} XP to Level {nextLevel.level} ({nextLevel.name})</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><p className="text-white/70">Badges</p><p className="font-bold">{unlockedBadges.length}/{badges.length}</p></div>
            <div><p className="text-white/70">Challenges</p><p className="font-bold">{completedChallenges.length}/{challenges.length}</p></div>
            <div><p className="text-white/70">Total XP</p><p className="font-bold">{xp.toLocaleString()}</p></div>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          {(["overview", "badges", "challenges"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* All levels */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Crown className="h-4 w-4 text-yellow-500" /> Level Progression</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {LEVELS.map(lvl => {
                  const isActive = lvl.level === currentLevel.level;
                  const achieved = xp >= lvl.minXP;
                  return (
                    <div key={lvl.level} className={`flex items-center gap-3 p-2 rounded-lg ${isActive ? "bg-primary/10 border border-primary" : ""}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${achieved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <lvl.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium">Lv.{lvl.level} {lvl.name}</span>
                        <p className="text-xs text-muted-foreground">{lvl.minXP.toLocaleString()} XP</p>
                      </div>
                      {isActive && <Badge>Current</Badge>}
                      {achieved && !isActive && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {!achieved && <Lock className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "badges" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{unlockedBadges.length} of {badges.length} unlocked</p>
            <div className="grid grid-cols-2 gap-3">
              {[...unlockedBadges, ...lockedBadges].map(badge => (
                <Card key={badge.id} className={`transition-all ${badge.unlocked ? "" : "opacity-50"}`}>
                  <CardContent className="p-4 text-center">
                    <div className={`w-14 h-14 mx-auto mb-2 rounded-2xl flex items-center justify-center ${badge.unlocked ? "bg-primary/10" : "bg-muted"}`}>
                      {badge.unlocked ? <badge.icon className={`h-7 w-7 ${badge.color}`} /> : <Lock className="h-6 w-6 text-muted-foreground" />}
                    </div>
                    <p className="font-semibold text-xs mb-1">{badge.name}</p>
                    <p className="text-xs text-muted-foreground mb-2 leading-tight">{badge.desc}</p>
                    <Badge variant={badge.unlocked ? "default" : "outline"} className="text-xs">+{badge.xp} XP</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === "challenges" && (
          <div className="space-y-3">
            {challenges.map(ch => (
              <Card key={ch.id} className={ch.completed ? "border-green-200 bg-green-50" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ch.completed ? "bg-green-100" : "bg-muted"}`}>
                      {ch.completed ? <CheckCircle className="h-5 w-5 text-green-600" /> : <ch.icon className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">{ch.title}</p>
                        <Badge variant={ch.completed ? "default" : "secondary"} className="text-xs">+{ch.xp} XP</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{ch.desc}</p>
                      <Progress value={(ch.progress / ch.target) * 100} className="h-2 mb-1" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{ch.progress}/{ch.target}</span>
                        <span>{ch.deadline}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


export default Gamification;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Star, Gift, TrendingUp, Award, Tag, Zap, Crown,
  CheckCircle, Lock, ShoppingBag, Coins, Sparkles,
} from "lucide-react";

interface RewardTier {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  gradient: string;
  minPoints: number;
  cashbackPct: number;
  perks: string[];
}

const TIERS: RewardTier[] = [
  {
    key: "bronze", label: "Bronze", icon: Award, color: "text-orange-600",
    gradient: "from-orange-400 to-orange-600",
    minPoints: 0, cashbackPct: 0.5,
    perks: ["0.5% cashback on all purchases", "Basic transaction alerts", "Standard support"],
  },
  {
    key: "silver", label: "Silver", icon: Star, color: "text-slate-500",
    gradient: "from-slate-400 to-slate-600",
    minPoints: 500, cashbackPct: 1.0,
    perks: ["1% cashback on all purchases", "Priority support", "Free monthly statement", "Birthday bonus (50 pts)"],
  },
  {
    key: "gold", label: "Gold", icon: Zap, color: "text-yellow-500",
    gradient: "from-yellow-400 to-yellow-600",
    minPoints: 2000, cashbackPct: 1.5,
    perks: ["1.5% cashback", "0 transfer fees (2/month)", "Merchant discounts", "Dedicated support"],
  },
  {
    key: "platinum", label: "Platinum", icon: Crown, color: "text-purple-600",
    gradient: "from-purple-500 to-purple-700",
    minPoints: 5000, cashbackPct: 2.0,
    perks: ["2% cashback", "Unlimited free transfers", "VIP merchant deals", "Concierge support", "Lounge access"],
  },
];

interface Offer {
  id: string;
  brand: string;
  discount: string;
  desc: string;
  expiry: string;
  category: string;
  icon: string;
}

const OFFERS: Offer[] = [
  { id: "1", brand: "FoodMart",       discount: "10% off",      desc: "On grocery purchases",         expiry: "Jul 31", category: "food",      icon: "🛒" },
  { id: "2", brand: "TechStore",      discount: "5% off",       desc: "Electronics & accessories",    expiry: "Jul 15", category: "tech",      icon: "💻" },
  { id: "3", brand: "FuelPlus",       discount: "$2 off/fill",  desc: "Per fuel fill-up",             expiry: "Jun 30", category: "fuel",      icon: "⛽" },
  { id: "4", brand: "CafeBlend",      discount: "Free coffee",  desc: "With any purchase over $15",   expiry: "Jul 20", category: "food",      icon: "☕" },
  { id: "5", brand: "PharmaCare",     discount: "8% off",       desc: "Pharmacy & health products",   expiry: "Aug 1",  category: "health",    icon: "💊" },
  { id: "6", brand: "TravelEasy",     discount: "3% off",       desc: "Flight & hotel bookings",      expiry: "Sep 1",  category: "travel",    icon: "✈️" },
];

interface PointActivity {
  date: string;
  description: string;
  points: number;
  type: "earned" | "redeemed" | "bonus";
}

const STORAGE_KEY = "vbank_rewards_v1";

const Rewards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [points, setPoints] = useState(0);
  const [cashback, setCashback] = useState(0);
  const [activities, setActivities] = useState<PointActivity[]>([]);
  const [userId, setUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "offers" | "history">("overview");

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) {
      const saved = JSON.parse(raw);
      setPoints(saved.points || 0);
      setCashback(saved.cashback || 0);
      setActivities(saved.activities || []);
    } else {
      // Seed from transactions
      const { data: txs } = await supabase
        .from("transactions")
        .select("amount, status, transaction_type, created_at, description")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .eq("status", "completed")
        .limit(20);
      let pts = 0;
      let cb = 0;
      const acts: PointActivity[] = [];
      (txs || []).forEach((tx: any) => {
        const txPts = Math.floor(tx.amount * 2);
        const txCb = parseFloat((tx.amount * 0.005).toFixed(2));
        pts += txPts;
        cb += txCb;
        acts.push({ date: tx.created_at, description: tx.description || "Transaction", points: txPts, type: "earned" });
      });
      // Welcome bonus
      pts += 100;
      acts.unshift({ date: new Date().toISOString(), description: "Welcome bonus", points: 100, type: "bonus" });
      const data = { points: pts, cashback: cb, activities: acts };
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(data));
      setPoints(pts);
      setCashback(cb);
      setActivities(acts);
    }
  };

  const redeemCashback = () => {
    if (cashback < 1) { toast({ title: "Minimum $1.00 to redeem", variant: "destructive" }); return; }
    toast({ title: "Cashback Redeemed!", description: `$${cashback.toFixed(2)} added to your wallet.` });
    const newData = { points, cashback: 0, activities: [
      { date: new Date().toISOString(), description: `Cashback redeemed: $${cashback.toFixed(2)}`, points: 0, type: "redeemed" as const },
      ...activities,
    ]};
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(newData));
    setCashback(0);
  };

  const currentTier = [...TIERS].reverse().find(t => points >= t.minPoints) || TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const progressToNext = nextTier ? Math.min((points / nextTier.minPoints) * 100, 100) : 100;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2"><Star className="h-5 w-5" /> Rewards</h1>
              <p className="text-xs text-white/70">Earn points on every transaction</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{points.toLocaleString()}</p>
            <p className="text-xs text-white/70">Total Points</p>
          </div>
        </div>
        {/* Tier badge */}
        <div className="bg-white/20 rounded-2xl p-3 flex items-center gap-3">
          <div className={`w-12 h-12 bg-gradient-to-br ${currentTier.gradient} rounded-2xl flex items-center justify-center`}>
            <currentTier.icon className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold">{currentTier.label} Member</p>
            <p className="text-xs text-white/80">{currentTier.cashbackPct}% cashback on purchases</p>
            {nextTier && (
              <>
                <Progress value={progressToNext} className="h-1.5 mt-1 bg-white/30" />
                <p className="text-[10px] text-white/70 mt-1">
                  {nextTier.minPoints - points} pts to {nextTier.label}
                </p>
              </>
            )}
          </div>
          {!nextTier && <Badge className="bg-white text-yellow-600">MAX TIER</Badge>}
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2">
          {(["overview", "offers", "history"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Cashback card */}
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Cashback Balance</p>
                    <p className="text-3xl font-bold text-green-700">${cashback.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Minimum $1.00 to redeem</p>
                  </div>
                  <Button onClick={redeemCashback} disabled={cashback < 1} className="bg-green-600 hover:bg-green-700">
                    <Coins className="h-4 w-4 mr-2" /> Redeem
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Tiers */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-yellow-500" /> Membership Tiers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {TIERS.map((tier, i) => {
                  const isActive = tier.key === currentTier.key;
                  const isAchieved = points >= tier.minPoints;
                  const isLocked = !isAchieved;
                  return (
                    <div key={tier.key} className={`p-3 rounded-xl border-2 ${isActive ? "border-primary bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-gradient-to-br ${tier.gradient} rounded-xl flex items-center justify-center`}>
                          <tier.icon className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{tier.label}</span>
                            {isActive && <Badge className="text-xs">Current</Badge>}
                            {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </div>
                          <p className="text-xs text-muted-foreground">{tier.minPoints.toLocaleString()} pts · {tier.cashbackPct}% cashback</p>
                        </div>
                        {isAchieved && !isActive && <CheckCircle className="h-4 w-4 text-green-500" />}
                      </div>
                      {isActive && (
                        <div className="mt-2 space-y-1">
                          {tier.perks.map(p => (
                            <p key={p} className="text-xs flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />{p}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* How to earn */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" /> How to Earn Points</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  { label: "Every $1 spent",      pts: "2 pts", icon: "💸" },
                  { label: "Bill payments",        pts: "5 pts", icon: "📄" },
                  { label: "Referral bonus",       pts: "200 pts", icon: "👥" },
                  { label: "Birthday reward",      pts: "50 pts", icon: "🎂" },
                  { label: "Monthly challenge",    pts: "Up to 100 pts", icon: "🏆" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                    <span>{item.icon} {item.label}</span>
                    <Badge variant="secondary">{item.pts}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "offers" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Exclusive deals for {currentTier.label} members</p>
            {OFFERS.map(offer => (
              <Card key={offer.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{offer.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{offer.brand}</p>
                        <Badge variant="secondary" className="text-xs">{offer.category}</Badge>
                      </div>
                      <p className="text-xl font-bold text-primary">{offer.discount}</p>
                      <p className="text-xs text-muted-foreground">{offer.desc} · Expires {offer.expiry}</p>
                    </div>
                    <Button size="sm" onClick={() => toast({ title: "Offer activated!", description: `${offer.discount} at ${offer.brand}` })}>
                      <Tag className="h-3 w-3 mr-1" /> Claim
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "history" && (
          <div className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-10">No activity yet</p>
            ) : (
              activities.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    a.type === "earned" ? "bg-green-100" : a.type === "bonus" ? "bg-yellow-100" : "bg-blue-100"
                  }`}>
                    {a.type === "earned" ? <TrendingUp className="h-4 w-4 text-green-600" />
                      : a.type === "bonus" ? <Gift className="h-4 w-4 text-yellow-600" />
                      : <Coins className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium truncate">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(a.date).toLocaleDateString()}</p>
                  </div>
                  {a.points > 0 && (
                    <span className="text-sm font-bold text-green-600">+{a.points} pts</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Rewards;

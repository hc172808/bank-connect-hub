import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Lightbulb, TrendingUp, PiggyBank, AlertTriangle,
  Target, Shield, BarChart3, RefreshCw, CheckCircle2,
  ThumbsUp, ChevronRight, Sparkles, Clock,
} from "lucide-react";
import { startOfMonth, subMonths } from "date-fns";

type Priority = "high" | "medium" | "low";
type Category = "budget" | "savings" | "investment" | "alert" | "security" | "reward";

interface Recommendation {
  id: string;
  category: Category;
  priority: Priority;
  title: string;
  description: string;
  action: string;
  actionPath?: string;
  impact: string;
  dismissed: boolean;
}

const DISMISSED_KEY = "vbank_recs_dismissed_v1";
function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}
function addDismissed(id: string) {
  const d = getDismissed();
  if (!d.includes(id)) { d.push(id); localStorage.setItem(DISMISSED_KEY, JSON.stringify(d)); }
}

const catIcon: Record<Category, React.ElementType> = {
  budget: BarChart3, savings: PiggyBank, investment: TrendingUp,
  alert: AlertTriangle, security: Shield, reward: Target,
};
const catColor: Record<Category, string> = {
  budget: "text-blue-600 bg-blue-50 border-blue-200",
  savings: "text-green-600 bg-green-50 border-green-200",
  investment: "text-purple-600 bg-purple-50 border-purple-200",
  alert: "text-red-600 bg-red-50 border-red-200",
  security: "text-orange-600 bg-orange-50 border-orange-200",
  reward: "text-yellow-600 bg-yellow-50 border-yellow-200",
};
const priorityBadge: Record<Priority, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-green-100 text-green-700",
};

function generateRecommendations(
  monthlyIncome: number,
  monthlyExpenses: number,
  balance: number,
  txCount: number,
  savingsRate: number,
  topCategory: string,
  topAmount: number,
): Recommendation[] {
  const dismissed = getDismissed();
  const recs: Omit<Recommendation, "dismissed">[] = [];
  const net = monthlyIncome - monthlyExpenses;

  // Budget alerts
  if (net < 0) {
    recs.push({
      id: "budget-deficit",
      category: "alert",
      priority: "high",
      title: "⚠️ You're Spending More Than You Earn",
      description: `Your expenses ($${monthlyExpenses.toFixed(0)}) exceed your income ($${monthlyIncome.toFixed(0)}) by $${Math.abs(net).toFixed(0)} this month.`,
      action: "Review Spending",
      actionPath: "/financial-tools",
      impact: `Cutting ${topCategory} by 20% saves $${(topAmount * 0.2).toFixed(0)}/month`,
    });
  }

  if (topAmount > monthlyExpenses * 0.35) {
    recs.push({
      id: "top-category",
      category: "budget",
      priority: net < 0 ? "high" : "medium",
      title: `Your Top Spend: ${topCategory}`,
      description: `${topCategory} accounts for ${((topAmount / monthlyExpenses) * 100).toFixed(0)}% of your monthly spending ($${topAmount.toFixed(0)}).`,
      action: "Set a Budget Cap",
      actionPath: "/budget",
      impact: `Reduce by 15% to save $${(topAmount * 0.15).toFixed(0)}/month`,
    });
  }

  // Savings recommendations
  if (savingsRate < 10) {
    recs.push({
      id: "savings-low",
      category: "savings",
      priority: "high",
      title: "Start Saving — Even $10 Helps",
      description: `You're saving ${savingsRate.toFixed(1)}% of your income. Even automating a small amount builds financial resilience.`,
      action: "Open Savings Goal",
      actionPath: "/savings",
      impact: "Saving $50/month = $600/year",
    });
  } else if (savingsRate >= 10 && savingsRate < 20) {
    recs.push({
      id: "savings-boost",
      category: "savings",
      priority: "medium",
      title: "Boost Savings to 20%",
      description: `You're at ${savingsRate.toFixed(1)}%. The 20% rule is the financial industry standard for long-term security.`,
      action: "Increase Auto-Save",
      actionPath: "/savings",
      impact: `An extra $${(monthlyIncome * (0.20 - savingsRate / 100)).toFixed(0)}/month reaches the target`,
    });
  } else {
    recs.push({
      id: "savings-great",
      category: "savings",
      priority: "low",
      title: "Excellent Savings Rate! 🌟",
      description: `At ${savingsRate.toFixed(1)}%, you're well above the recommended 20%. Consider moving surplus to higher-yield investments.`,
      action: "Explore Investments",
      actionPath: "/investments",
      impact: "Higher-yield placement can 2–4× your returns",
    });
  }

  // Emergency fund
  const emergencyTarget = monthlyExpenses * 3;
  if (balance < emergencyTarget) {
    recs.push({
      id: "emergency-fund",
      category: "savings",
      priority: balance < monthlyExpenses ? "high" : "medium",
      title: "Build Your Emergency Fund",
      description: `Your balance ($${balance.toFixed(0)}) is below the recommended 3-month cushion ($${emergencyTarget.toFixed(0)}).`,
      action: "Start Emergency Savings",
      actionPath: "/savings",
      impact: `At current rate: ${Math.ceil((emergencyTarget - balance) / Math.max(1, monthlyIncome * 0.1))} months to goal`,
    });
  }

  // Investment prompt
  if (savingsRate >= 20 && net > 200) {
    recs.push({
      id: "invest-surplus",
      category: "investment",
      priority: "medium",
      title: "Put Your Surplus to Work",
      description: `You have a monthly surplus of $${net.toFixed(0)}. Investing even half of it can significantly grow your wealth over time.`,
      action: "View Investments",
      actionPath: "/investments",
      impact: `$${(net * 0.5).toFixed(0)}/month invested = $${(net * 0.5 * 12).toFixed(0)}/year`,
    });
  }

  // Activity rewards
  if (txCount >= 10) {
    recs.push({
      id: "rewards-active",
      category: "reward",
      priority: "low",
      title: "You're Earning Cashback Rewards",
      description: `With ${txCount} transactions this month, you're eligible for cashback and loyalty points. Check your rewards balance.`,
      action: "View Rewards",
      actionPath: "/rewards",
      impact: "Redeem points for cash or discounts",
    });
  }

  // Security nudge
  recs.push({
    id: "security-review",
    category: "security",
    priority: "low",
    title: "Review Your Security Settings",
    description: "Regular security check-ups keep your account protected. Verify 2FA, trusted devices, and PIN settings.",
    action: "Security Settings",
    actionPath: "/security",
    impact: "Protect against unauthorized access",
  });

  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return recs
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .map(r => ({ ...r, dismissed: dismissed.includes(r.id) }));
}

export default function PersonalizedRecommendations() {
  const navigate = useNavigate();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const monthStart = startOfMonth(new Date()).toISOString();
      const [walletRes, txRes] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).eq("wallet_type", "main").single(),
        supabase.from("transactions").select("amount, transaction_type, description")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .gte("created_at", monthStart).eq("status", "completed").limit(300),
      ]);

      const txs = txRes.data || [];
      const balance = (walletRes.data as { balance: number } | null)?.balance || 0;

      let income = 0, expenses = 0;
      const catMap: Record<string, number> = {};
      txs.forEach(t => {
        const isIncoming = ["deposit", "transfer_in", "receive"].includes(t.transaction_type);
        if (isIncoming) { income += t.amount; }
        else {
          expenses += t.amount;
          const cat = t.description?.split(" ")[0] || "Other";
          catMap[cat] = (catMap[cat] || 0) + t.amount;
        }
      });

      const topEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
      const savingsRate = income > 0 ? Math.max(0, ((income - expenses) / income) * 100) : 0;

      setRecs(generateRecommendations(
        income, expenses, balance, txs.length, savingsRate,
        topEntry?.[0] || "General", topEntry?.[1] || 0,
      ));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const dismiss = (id: string) => {
    addDismissed(id);
    setRecs(prev => prev.map(r => r.id === id ? { ...r, dismissed: true } : r));
  };

  const visible = recs.filter(r => !r.dismissed);
  const shown = showAll ? visible : visible.slice(0, 4);
  const highCount = visible.filter(r => r.priority === "high").length;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-black flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Personalized Recommendations
            </h1>
            <p className="text-xs text-white/70">AI-powered insights based on your financial data</p>
          </div>
          <Button variant="ghost" size="icon" onClick={loadData} className="text-white">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex gap-3">
          <div className="flex-1 bg-white/15 rounded-xl p-3 text-center">
            <p className="text-2xl font-black">{visible.length}</p>
            <p className="text-xs text-white/70">Recommendations</p>
          </div>
          <div className="flex-1 bg-white/15 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-200">{highCount}</p>
            <p className="text-xs text-white/70">High Priority</p>
          </div>
          <div className="flex-1 bg-white/15 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-white/60">{recs.filter(r => r.dismissed).length}</p>
            <p className="text-xs text-white/70">Dismissed</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        {loading && (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>Analyzing your financial data…</span>
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ThumbsUp className="h-12 w-12 text-green-500" />
            <p className="font-bold text-lg text-green-600">You're on track!</p>
            <p className="text-sm text-muted-foreground">No urgent recommendations right now. Keep up the great financial habits.</p>
            <Button variant="outline" onClick={loadData}>Refresh Analysis</Button>
          </div>
        )}

        {shown.map(rec => {
          const Icon = catIcon[rec.category];
          return (
            <Card key={rec.id} className={`border ${catColor[rec.category]}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${catColor[rec.category]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-bold text-sm">{rec.title}</span>
                      <Badge className={`text-[10px] ${priorityBadge[rec.priority]} border-0`}>
                        {rec.priority.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                    <div className="flex items-center gap-1 text-xs text-primary mb-3">
                      <Target className="h-3 w-3" />
                      <span>{rec.impact}</span>
                    </div>
                    <div className="flex gap-2">
                      {rec.actionPath && (
                        <Button
                          size="sm"
                          onClick={() => navigate(rec.actionPath!)}
                          className="h-7 text-xs gap-1"
                        >
                          {rec.action} <ChevronRight className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => dismiss(rec.id)}
                        className="h-7 text-xs text-muted-foreground"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {!loading && visible.length > 4 && !showAll && (
          <Button variant="outline" className="w-full" onClick={() => setShowAll(true)}>
            Show {visible.length - 4} more recommendations
          </Button>
        )}

        {!loading && recs.some(r => r.dismissed) && (
          <Button
            variant="ghost"
            className="w-full text-muted-foreground text-xs"
            onClick={() => {
              localStorage.removeItem(DISMISSED_KEY);
              loadData();
            }}
          >
            Reset dismissed recommendations
          </Button>
        )}
      </div>
    </div>
  );
}

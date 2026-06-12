import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, TrendingUp, ShieldCheck, CheckCircle, Clock,
  AlertTriangle, Star, Award, Zap, DollarSign, Users, CreditCard,
} from "lucide-react";
import { format, subDays } from "date-fns";

interface CreditFactor {
  label: string;
  score: number;
  max: number;
  icon: React.ElementType;
  color: string;
  tip: string;
}

interface CreditActivity {
  date: string;
  event: string;
  impact: "positive" | "negative" | "neutral";
  points: number;
}

function getScoreLabel(score: number) {
  if (score >= 750) return { label: "Excellent", color: "text-green-600", bg: "bg-green-100" };
  if (score >= 700) return { label: "Good",      color: "text-blue-600",  bg: "bg-blue-100" };
  if (score >= 650) return { label: "Fair",      color: "text-yellow-600",bg: "bg-yellow-100" };
  if (score >= 580) return { label: "Poor",      color: "text-orange-600",bg: "bg-orange-100" };
  return                    { label: "Bad",       color: "text-red-600",   bg: "bg-red-100" };
}

const CreditBuilder = () => {
  const navigate = useNavigate();
  const [creditScore, setCreditScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<CreditFactor[]>([]);
  const [activities, setActivities] = useState<CreditActivity[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
    const ninetyDaysAgo = subDays(new Date(), 90).toISOString();

    const [walletRes, txRes, txRecentRes, kycRes] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
      supabase.from("transactions").select("id, status, created_at, amount, transaction_type", { count: "exact" })
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .gte("created_at", ninetyDaysAgo),
      supabase.from("transactions").select("id, status", { count: "exact" })
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .gte("created_at", thirtyDaysAgo)
        .eq("status", "completed"),
      supabase.from("profiles").select("kyc_status, two_factor_enabled, created_at").eq("id", user.id).single(),
    ]);

    const balance = (walletRes.data as any)?.balance || 0;
    setWalletBalance(balance);
    const totalTx = txRes.count || 0;
    const completedTx = txRecentRes.count || 0;
    setTxCount(totalTx);

    const profileData = kycRes.data as any;
    const kycVerified = profileData?.kyc_status === "approved";
    const twoFAOn = profileData?.two_factor_enabled || false;
    const accountAgeDays = profileData?.created_at
      ? Math.floor((Date.now() - new Date(profileData.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const txScore     = Math.min(completedTx * 5, 200);
    const balScore    = Math.min(Math.floor(balance / 10), 200);
    const kycScore    = kycVerified ? 150 : 50;
    const ageScore    = Math.min(Math.floor(accountAgeDays / 5), 150);
    const secScore    = twoFAOn ? 100 : 30;
    const totalScore  = Math.min(txScore + balScore + kycScore + ageScore + secScore, 850);

    setCreditScore(totalScore);

    setFactors([
      {
        label:  "Transaction History",
        score:  txScore,
        max:    200,
        icon:   TrendingUp,
        color:  "text-blue-600",
        tip:    completedTx >= 10 ? "Great transaction activity!" : `Complete more transactions to improve (${completedTx}/10 this month).`,
      },
      {
        label:  "Account Balance",
        score:  balScore,
        max:    200,
        icon:   DollarSign,
        color:  "text-green-600",
        tip:    balance >= 1000 ? "Healthy balance maintained." : "Maintaining a higher balance improves your score.",
      },
      {
        label:  "Identity Verification",
        score:  kycScore,
        max:    150,
        icon:   ShieldCheck,
        color:  "text-purple-600",
        tip:    kycVerified ? "KYC verified — full score." : "Complete KYC to unlock more credit.",
      },
      {
        label:  "Account Age",
        score:  ageScore,
        max:    150,
        icon:   Award,
        color:  "text-orange-600",
        tip:    accountAgeDays >= 365 ? "Established account." : `${accountAgeDays} days old — score improves over time.`,
      },
      {
        label:  "Security Practices",
        score:  secScore,
        max:    100,
        icon:   Zap,
        color:  "text-yellow-600",
        tip:    twoFAOn ? "2FA enabled — full security score." : "Enable 2FA to boost your security score.",
      },
    ]);

    const recentActivities: CreditActivity[] = [];
    if (txRes.data) {
      txRes.data.slice(0, 5).forEach((t: any) => {
        recentActivities.push({
          date: t.created_at,
          event: t.status === "completed"
            ? `${t.transaction_type === "deposit" ? "Deposit" : "Transaction"} completed`
            : "Transaction pending",
          impact: t.status === "completed" ? "positive" : "neutral",
          points: t.status === "completed" ? +3 : 0,
        });
      });
    }
    if (!kycVerified) {
      recentActivities.push({
        date: new Date().toISOString(),
        event: "KYC not completed — score limited",
        impact: "negative",
        points: -50,
      });
    }
    if (twoFAOn) {
      recentActivities.push({
        date: new Date().toISOString(),
        event: "2FA security enabled",
        impact: "positive",
        points: +70,
      });
    }
    setActivities(recentActivities.slice(0, 8));
    setLoading(false);
  };

  const { label, color, bg } = getScoreLabel(creditScore);
  const scorePct = (creditScore / 850) * 100;

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Star className="h-5 w-5" /> Credit Builder
          </h1>
          <p className="text-xs text-primary-foreground/70">Build your financial reputation</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-20 text-muted-foreground">Calculating your score...</div>
        ) : (
          <>
            {/* Score Card */}
            <Card className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
              <CardContent className="p-6 text-center">
                <div className="text-7xl font-bold mb-2">{creditScore}</div>
                <Badge className={`${bg} ${color} border-0 text-base px-4 py-1 mb-4`}>{label}</Badge>
                <Progress value={scorePct} className="h-3 bg-primary-foreground/20 mb-2" />
                <div className="flex justify-between text-xs text-primary-foreground/70">
                  <span>300 — Poor</span>
                  <span>850 — Excellent</span>
                </div>
              </CardContent>
            </Card>

            {/* Score Factors */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Score Breakdown</CardTitle>
                <CardDescription>What's affecting your credit score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {factors.map(f => (
                  <div key={f.label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <f.icon className={`h-4 w-4 ${f.color}`} />
                        <span className="text-sm font-medium">{f.label}</span>
                      </div>
                      <span className="text-sm font-bold">{f.score}/{f.max}</span>
                    </div>
                    <Progress value={(f.score / f.max) * 100} className="h-2 mb-1" />
                    <p className="text-xs text-muted-foreground">{f.tip}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* How to Improve */}
            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" /> Improve Your Score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { done: txCount >= 20,            text: "Complete 20+ transactions (active usage)" },
                  { done: walletBalance >= 500,      text: "Maintain $500+ wallet balance" },
                  { done: factors[2]?.score >= 150,  text: "Complete KYC verification" },
                  { done: factors[4]?.score >= 100,  text: "Enable 2FA security" },
                  { done: factors[3]?.score >= 100,  text: "Keep account active for 6+ months" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    {item.done
                      ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                      : <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <p className={`text-sm ${item.done ? "text-green-700 line-through" : "text-foreground"}`}>
                      {item.text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            {activities.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent Credit Activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {activities.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded border">
                      {a.impact === "positive"
                        ? <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
                        : a.impact === "negative"
                          ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                          : <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex-1">
                        <p className="text-sm">{a.event}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(a.date), "MMM d, yyyy")}</p>
                      </div>
                      {a.points !== 0 && (
                        <span className={`text-xs font-bold ${a.points > 0 ? "text-green-600" : "text-red-600"}`}>
                          {a.points > 0 ? "+" : ""}{a.points} pts
                        </span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => navigate("/kyc")} className="gap-2">
                <ShieldCheck className="h-4 w-4" /> Verify KYC
              </Button>
              <Button variant="outline" onClick={() => navigate("/security")} className="gap-2">
                <Zap className="h-4 w-4" /> Enable 2FA
              </Button>
              <Button variant="outline" onClick={() => navigate("/loans")} className="gap-2">
                <CreditCard className="h-4 w-4" /> View Loans
              </Button>
              <Button variant="outline" onClick={() => navigate("/send-money")} className="gap-2">
                <Users className="h-4 w-4" /> Transact More
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CreditBuilder;

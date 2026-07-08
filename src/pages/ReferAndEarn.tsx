import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Gift, Copy, Share2, Users, CheckCircle2,
  Clock, Sparkles, Trophy, TrendingUp, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { getRewardsData, getReferralPointsEarned } from "@/lib/rewards";
import { supabase } from "@/integrations/supabase/client";

const ReferAndEarn = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const referralCode = user?.id?.slice(0, 8).toUpperCase() || "XXXXXXXX";
  const referralLink = `${window.location.origin}/register?ref=${referralCode}`;

  const [referralCount, setReferralCount] = useState(0);
  const [referralPts, setReferralPts] = useState(0);
  const [recentActivity, setRecentActivity] = useState<
    { date: string; description: string; points: number }[]
  >([]);

  useEffect(() => {
    if (!user?.id) return;

    supabase
      .from("profiles")
      .select("referral_count")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setReferralCount((data as any)?.referral_count || 0);
      });

    const data = getRewardsData(user.id);
    const referralActivities = data.activities.filter(
      (a) =>
        a.description.toLowerCase().includes("referral") ||
        a.description.toLowerCase().includes("friend made")
    );
    setRecentActivity(
      referralActivities.slice(0, 5).map((a) => ({
        date: a.date,
        description: a.description,
        points: a.points,
      }))
    );
    setReferralPts(getReferralPointsEarned(user.id));
  }, [user?.id]);

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    toast({ title: "Copied!", description: "Referral code copied to clipboard" });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    toast({ title: "Link copied!", description: "Share this link with your friends" });
  };

  const shareCode = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join NETLIFE CASH",
          text: `Sign up with my referral code ${referralCode} and we both earn bonus points!`,
          url: referralLink,
        });
        return;
      } catch {}
    }
    copyLink();
  };

  const cashback = (referralPts * 0.005).toFixed(2);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Refer &amp; Earn</h1>

        <Card className="bg-gradient-to-br from-primary to-primary/80 mb-4">
          <CardContent className="p-6 text-center">
            <Gift size={48} className="mx-auto mb-3 text-primary-foreground" />
            <h2 className="text-2xl font-bold text-primary-foreground mb-1">
              Earn 200 Points per Referral
            </h2>
            <p className="text-primary-foreground/80 text-sm">
              Your friend gets 100 bonus points too — after their first transaction.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card>
            <CardContent className="p-4 text-center">
              <Users size={20} className="mx-auto mb-1 text-primary" />
              <p className="text-2xl font-bold">{referralCount}</p>
              <p className="text-xs text-muted-foreground">Successful</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Trophy size={20} className="mx-auto mb-1 text-yellow-500" />
              <p className="text-2xl font-bold">{referralPts}</p>
              <p className="text-xs text-muted-foreground">Pts Earned</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <TrendingUp size={20} className="mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold">${cashback}</p>
              <p className="text-xs text-muted-foreground">Cashback</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your Referral Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted p-4 rounded-xl text-center">
              <span className="text-3xl font-bold tracking-[0.25em] font-mono">{referralCode}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={copyCode} variant="outline" className="flex-1 gap-2">
                <Copy size={16} /> Copy Code
              </Button>
              <Button onClick={shareCode} className="flex-1 gap-2">
                <Share2 size={16} /> Share Link
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Or copy this link:{" "}
              <button
                onClick={copyLink}
                className="text-primary underline underline-offset-2 break-all"
              >
                {referralLink}
              </button>
            </p>
          </CardContent>
        </Card>

        {/* Leaderboard teaser */}
        <Card
          className="mb-4 border-yellow-500/30 bg-yellow-500/5 cursor-pointer hover:bg-yellow-500/10 transition-colors"
          onClick={() => navigate("/leaderboard")}
        >
          <CardContent className="py-3 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy size={20} className="text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Referral Leaderboard</p>
                <p className="text-xs text-muted-foreground">See who's earning the most from referrals</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles size={18} className="text-primary" /> How it Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4 text-sm">
              <li className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="font-medium">Share your code or link</p>
                  <p className="text-muted-foreground text-xs">Send it via WhatsApp, SMS, or social media</p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="font-medium">Friend signs up with your code</p>
                  <p className="text-muted-foreground text-xs">They enter your code in the "Referral Code" field on the register page</p>
                </div>
              </li>
              <li className="flex gap-3 items-start">
                <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="font-medium">Both of you earn points</p>
                  <p className="text-muted-foreground text-xs">You get <strong>200 pts</strong>, they get <strong>100 pts</strong> — after their first transaction</p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>

        {recentActivity.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Referral History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentActivity.map((act, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{act.description}</p>
                      <p className="text-xs text-muted-foreground">{new Date(act.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-green-600 bg-green-500/10">
                    +{act.points} pts
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <Clock size={32} className="mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium text-sm">No referrals yet</p>
              <p className="text-xs text-muted-foreground mt-1">Share your code above to start earning!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ReferAndEarn;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Trophy, Users, Medal, Loader2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getReferralPointsEarned } from "@/lib/rewards";

interface Leader {
  id: string;
  full_name: string | null;
  referral_count: number;
}

const RANK_STYLES = [
  { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-600", icon: "🥇" },
  { bg: "bg-gray-400/10 border-gray-400/30",     text: "text-gray-500",   icon: "🥈" },
  { bg: "bg-amber-600/10 border-amber-600/30",   text: "text-amber-700",  icon: "🥉" },
];

const Leaderboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<number | null>(null);
  const myPts = user?.id ? getReferralPointsEarned(user.id) : 0;

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, referral_count")
      .gt("referral_count", 0)
      .order("referral_count", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        const rows = (data || []) as unknown as Leader[];
        setLeaders(rows);
        if (user?.id) {
          const idx = rows.findIndex(r => r.id === user.id);
          setMyRank(idx >= 0 ? idx + 1 : null);
        }
        setLoading(false);
      });
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Trophy className="text-yellow-500" /> Referral Leaderboard
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Top users by successful referrals this month.
        </p>

        {/* My position */}
        {user && (
          <Card className="mb-5 border-primary/30 bg-primary/5">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star size={16} className="text-primary" />
                <span className="text-sm font-medium">Your position</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{myPts} pts earned</span>
                <Badge variant="outline" className="text-primary border-primary/40">
                  {myRank ? `#${myRank}` : "Unranked"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : leaders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users size={40} className="mx-auto mb-3 text-muted-foreground" />
              <p className="font-medium">No referrals yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Be the first to refer a friend and top the board!
              </p>
              <Button className="mt-4" onClick={() => navigate("/refer-and-earn")}>
                Start Referring
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {leaders.map((leader, idx) => {
              const rank = idx + 1;
              const style = RANK_STYLES[idx] || { bg: "bg-muted/30 border-muted", text: "text-muted-foreground", icon: null };
              const isMe = leader.id === user?.id;
              const initials = (leader.full_name || "?").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

              return (
                <Card
                  key={leader.id}
                  className={`border ${style.bg} ${isMe ? "ring-2 ring-primary ring-offset-1" : ""}`}
                >
                  <CardContent className="py-3 px-4 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg ${rank <= 3 ? "" : "bg-muted"}`}>
                      {rank <= 3 ? style.icon : (
                        <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
                      )}
                    </div>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {leader.full_name || "Anonymous"}
                        {isMe && <span className="ml-1 text-xs text-primary">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {leader.referral_count} referral{leader.referral_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${style.text}`}>
                        {leader.referral_count * 200} pts
                      </p>
                      {rank <= 3 && (
                        <Badge variant="secondary" className={`text-xs ${style.text}`}>
                          <Medal size={10} className="mr-1" /> Top {rank}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;

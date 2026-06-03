import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RotateCcw, Clock } from "lucide-react";

interface Reversal {
  id: string;
  amount: number;
  status: string;
  requester_id: string;
  recipient_id: string;
  funds_held_at: string | null;
  reason: string | null;
}

const fmtRemain = (ms: number) => {
  if (ms <= 0) return "any moment";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
};

export const ReversalHoldBanner = () => {
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<Reversal[]>([]);
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);
      const { data } = await supabase
        .from("fund_reversals")
        .select("*")
        .in("status", ["pending", "approved"])
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      setItems((data as Reversal[]) || []);
    })();
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!uid || items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((r) => {
        const isRecipient = r.recipient_id === uid;
        const releaseAt = r.funds_held_at
          ? new Date(new Date(r.funds_held_at).getTime() + 60 * 60 * 1000)
          : null;
        const remaining = releaseAt ? releaseAt.getTime() - Date.now() : 0;

        if (r.status === "pending") {
          return (
            <Card
              key={r.id}
              className="p-3 border-yellow-500/40 bg-yellow-500/5 cursor-pointer"
              onClick={() => navigate(isRecipient ? "/transactions" : "/request-reversal")}
            >
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="flex-1 text-xs">
                  <p className="font-semibold">
                    {isRecipient ? "Reversal claim on your account" : "Reversal request pending"}
                  </p>
                  <p className="text-muted-foreground">
                    ${r.amount} — awaiting admin review. Funds remain in your account until decided.
                  </p>
                </div>
              </div>
            </Card>
          );
        }

        // approved → hold
        return (
          <Card key={r.id} className="p-3 border-destructive/40 bg-destructive/5">
            <div className="flex items-start gap-2">
              {isRecipient ? (
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              ) : (
                <RotateCcw className="h-4 w-4 text-blue-600 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <p className="font-semibold">
                  {isRecipient ? "Reversal hold — funds deducted" : "Funds returning soon"}
                </p>
                <p className="text-muted-foreground">
                  ${r.amount} —{" "}
                  {isRecipient
                    ? "removed from your wallet. You cannot use this amount."
                    : "will return to your wallet in"}{" "}
                  {!isRecipient && <span className="font-mono">{fmtRemain(remaining)}</span>}
                </p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default ReversalHoldBanner;
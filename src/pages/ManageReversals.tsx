import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle, XCircle, Clock, RotateCcw,
  User, AlertTriangle, Loader2, RefreshCw, DollarSign,
  ArrowRight,
} from "lucide-react";

interface Reversal {
  id: string;
  transaction_id: string;
  requester_id: string;
  recipient_id: string;
  amount: number;
  reason: string | null;
  status: string;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  funds_held_at: string | null;
  funds_returned_at: string | null;
  reversal_transaction_id: string | null;
}

interface UserProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
}

const StatusBadge = ({ status }: { status: string }) => {
  switch (status) {
    case "pending":
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
    case "approved":
      return <Badge className="gap-1 bg-blue-600 text-white"><AlertTriangle className="h-3 w-3" /> Processing</Badge>;
    case "completed":
      return <Badge className="gap-1 bg-green-600 text-white"><CheckCircle className="h-3 w-3" /> Completed</Badge>;
    case "rejected":
      return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
    default:
      return null;
  }
};

const ManageReversals = () => {
  const [reversals, setReversals] = useState<Reversal[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchReversals();
  }, []);

  const fetchReversals = async () => {
    setFetching(true);
    const { data } = await supabase
      .from("fund_reversals")
      .select("*")
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      setReversals(data as Reversal[]);

      // Collect unique user IDs
      const userIds = [...new Set(data.flatMap((r: Reversal) => [r.requester_id, r.recipient_id]))];
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, phone_number")
        .in("id", userIds);

      if (profileData) {
        const map: Record<string, UserProfile> = {};
        profileData.forEach((p: UserProfile) => { map[p.id] = p; });
        setProfiles(map);
      }
    } else {
      setReversals([]);
    }
    setFetching(false);
  };

  const userName = (id: string) => {
    const p = profiles[id];
    if (!p) return id.slice(0, 8) + "…";
    return p.full_name || p.phone_number || id.slice(0, 8) + "…";
  };

  const handleApprove = async (rev: Reversal) => {
    setLoading(rev.id);
    try {
      const { data, error } = await supabase.rpc("approve_fund_reversal", {
        _reversal_id: rev.id,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; return_at?: string } | null;
      if (!result?.success) {
        throw new Error(result?.error || "The reversal could not be approved.");
      }

      const returnAt = result.return_at
        ? new Date(result.return_at).toLocaleString()
        : "after the one-hour hold";
      toast({
        title: "Reversal Approved",
        description: `$${rev.amount.toFixed(2)} is held and scheduled to return to ${userName(rev.requester_id)} at ${returnAt}.`,
      });
      await fetchReversals();
    } catch (error: any) {
      toast({ title: "Reversal Failed", description: error.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (rev: Reversal) => {
    setLoading(rev.id);
    try {
      const { data, error } = await supabase.rpc("reject_fund_reversal", {
        _reversal_id: rev.id,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string } | null;
      if (!result?.success) {
        throw new Error(result?.error || "The reversal could not be rejected.");
      }

      toast({ title: "Reversal Rejected", description: "The requester will be notified." });
      await fetchReversals();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <RotateCcw className="h-6 w-6" /> Fund Reversals
              </h1>
              <p className="text-sm text-muted-foreground">
                Approval places funds on hold for one hour before automatic return.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchReversals} disabled={fetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats row */}
        {reversals.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Pending", count: reversals.filter(r => r.status === "pending").length, color: "text-yellow-600" },
              { label: "On hold", count: reversals.filter(r => r.status === "approved").length, color: "text-blue-600" },
              { label: "Completed", count: reversals.filter(r => r.status === "completed").length, color: "text-green-600" },
              { label: "Rejected", count: reversals.filter(r => r.status === "rejected").length, color: "text-red-600" },
            ].map(({ label, count, color }) => (
              <Card key={label} className="p-3 text-center">
                <p className={`text-2xl font-bold ${color}`}>{count}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Reversal list */}
        {fetching ? (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading reversals…</span>
          </div>
        ) : reversals.length === 0 ? (
          <Card className="p-12 text-center">
            <RotateCcw className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="font-medium text-muted-foreground">No reversal requests yet</p>
            <p className="text-sm text-muted-foreground mt-1">When clients request refunds they will appear here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {reversals.map((rev) => (
              <Card key={rev.id} className={`overflow-hidden ${rev.status === "pending" ? "border-yellow-300 dark:border-yellow-700" : ""}`}>
                {rev.status === "pending" && (
                  <div className="h-1 bg-yellow-400" />
                )}
                {rev.status === "completed" && (
                  <div className="h-1 bg-green-500" />
                )}
                {rev.status === "approved" && (
                  <div className="h-1 bg-blue-500" />
                )}
                <CardContent className="p-5">
                  {/* Amount + status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-full bg-primary/10">
                        <DollarSign className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xl font-bold">${rev.amount.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(rev.requested_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <StatusBadge status={rev.status} />
                  </div>

                  {/* Sender → Recipient flow */}
                  <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Requester (sender)</p>
                        <p className="text-sm font-medium truncate">{userName(rev.requester_id)}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wide">Recipient (holds funds)</p>
                        <p className="text-sm font-medium truncate">{userName(rev.recipient_id)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Reason */}
                  {rev.reason && (
                    <div className="mb-3 text-sm text-muted-foreground flex items-start gap-2">
                      <span className="font-medium text-foreground shrink-0">Reason:</span>
                      {rev.reason}
                    </div>
                  )}

                  {/* Completed info */}
                  {rev.status === "completed" && rev.funds_returned_at && (
                    <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 dark:bg-green-900/20 rounded p-2 mb-3">
                      <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      Funds returned on {new Date(rev.funds_returned_at).toLocaleString()}
                    </div>
                  )}

                  {rev.status === "approved" && rev.funds_held_at && (
                    <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded p-2 mb-3">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      Funds are held. Scheduled return:{" "}
                      {new Date(new Date(rev.funds_held_at).getTime() + 60 * 60 * 1000).toLocaleString()}
                    </div>
                  )}

                  {/* Action buttons — only for pending */}
                  {rev.status === "pending" && (
                    <div className="flex gap-2 pt-3 border-t">
                      <Button
                        size="sm"
                        className="flex-1 gap-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApprove(rev)}
                        disabled={loading === rev.id}
                      >
                        {loading === rev.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <CheckCircle className="h-4 w-4" />}
                         Approve &amp; Hold for 1 Hour
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 gap-1"
                        onClick={() => handleReject(rev)}
                        disabled={loading === rev.id}
                      >
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageReversals;

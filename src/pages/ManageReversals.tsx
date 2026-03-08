import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, XCircle, Clock, RotateCcw } from "lucide-react";

const ManageReversals = () => {
  const [reversals, setReversals] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchReversals();
  }, []);

  const fetchReversals = async () => {
    const { data } = await supabase
      .from("fund_reversals")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setReversals(data);
  };

  const handleApprove = async (reversalId: string) => {
    setLoading(reversalId);
    try {
      const { data, error } = await supabase.rpc("approve_fund_reversal", {
        _reversal_id: reversalId,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };
      if (result.success) {
        toast({ title: "Reversal Approved", description: result.message || "Funds deducted from recipient. Will return to sender in 1 hour." });
        fetchReversals();
      } else {
        toast({ title: "Failed", description: result.error, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (reversalId: string) => {
    setLoading(reversalId);
    try {
      const { error } = await supabase
        .from("fund_reversals")
        .update({ status: "rejected", approved_by: (await supabase.auth.getUser()).data.user?.id, approved_at: new Date().toISOString() })
        .eq("id", reversalId);

      if (error) throw error;

      toast({ title: "Reversal Rejected" });
      fetchReversals();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">Pending</span>;
      case "approved": return <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">Approved - Holding</span>;
      case "completed": return <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">Completed</span>;
      case "rejected": return <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">Rejected</span>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Manage Fund Reversals</h1>

        <div className="space-y-4">
          {reversals.length === 0 ? (
            <Card className="p-8 text-center">
              <RotateCcw size={32} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">No reversal requests</p>
            </Card>
          ) : (
            reversals.map((rev) => (
              <Card key={rev.id} className="p-6">
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-1">
                    <p className="font-semibold text-lg">${rev.amount}</p>
                    <p className="text-sm text-muted-foreground">Requester: {rev.requester_id.slice(0, 8)}...</p>
                    <p className="text-sm text-muted-foreground">Recipient: {rev.recipient_id.slice(0, 8)}...</p>
                    <p className="text-sm text-muted-foreground">Reason: {rev.reason || "No reason given"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(rev.requested_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(rev.status)}
                    {rev.status === "approved" && rev.funds_held_at && (
                      <p className="text-xs text-muted-foreground">
                        Returns: {new Date(new Date(rev.funds_held_at).getTime() + 60 * 60 * 1000).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>

                {rev.status === "pending" && (
                  <div className="flex gap-2 pt-3 border-t border-border">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(rev.id)}
                      disabled={loading === rev.id}
                    >
                      <CheckCircle size={16} className="mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(rev.id)}
                      disabled={loading === rev.id}
                    >
                      <XCircle size={16} className="mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageReversals;

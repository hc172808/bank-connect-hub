import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";

const ApprovePendingDeposits = () => {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchPendingDeposits();
  }, []);

  const fetchPendingDeposits = async () => {
    const { data } = await supabase
      .from("pending_deposits")
      .select(`
        *,
        agent:agent_id(full_name),
        user:user_id(full_name)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (data) setDeposits(data);
  };

  const handleApprove = async (depositId: string, userId: string, amount: number) => {
    setLoading(depositId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update pending deposit status
      const { error: updateError } = await supabase
        .from("pending_deposits")
        .update({
          status: "approved",
          approved_by: user.id,
          processed_at: new Date().toISOString(),
        })
        .eq("id", depositId);

      if (updateError) throw updateError;

      // Add funds using admin function
      const { data, error: fundError } = await supabase.rpc("admin_add_funds", {
        _user_id: userId,
        _amount: amount,
      });

      if (fundError) throw fundError;

      toast({
        title: "Deposit Approved",
        description: `Successfully added $${amount} to user's account.`,
      });
      fetchPendingDeposits();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async (depositId: string) => {
    setLoading(depositId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("pending_deposits")
        .update({
          status: "rejected",
          approved_by: user.id,
          processed_at: new Date().toISOString(),
        })
        .eq("id", depositId);

      if (error) throw error;

      toast({
        title: "Deposit Rejected",
        description: "The deposit request has been rejected.",
      });
      fetchPendingDeposits();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Approve Pending Deposits</h1>

        <div className="space-y-4">
          {deposits.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No pending deposits to approve</p>
            </Card>
          ) : (
            deposits.map((deposit) => (
              <Card key={deposit.id} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-semibold text-lg">
                      ${deposit.amount}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Agent: {deposit.agent?.full_name || "Unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      User: {deposit.user?.full_name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(deposit.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleApprove(deposit.id, deposit.user_id, deposit.amount)}
                      disabled={loading === deposit.id}
                    >
                      <CheckCircle size={16} className="mr-1" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReject(deposit.id)}
                      disabled={loading === deposit.id}
                    >
                      <XCircle size={16} className="mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ApprovePendingDeposits;

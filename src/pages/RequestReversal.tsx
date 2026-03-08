import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RotateCcw, Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

const RequestReversal = () => {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [myReversals, setMyReversals] = useState<any[]>([]);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [txRes, revRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("sender_id", user.id)
        .eq("status", "completed")
        .eq("transaction_type", "transfer")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("fund_reversals")
        .select("*")
        .eq("requester_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (txRes.data) setTransactions(txRes.data);
    if (revRes.data) setMyReversals(revRes.data);
  };

  const handleRequest = async () => {
    if (!selectedTx) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if already requested
      const existing = myReversals.find(r => r.transaction_id === selectedTx.id);
      if (existing) {
        toast({ title: "Already Requested", description: "You already have a reversal request for this transaction.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("fund_reversals").insert({
        transaction_id: selectedTx.id,
        requester_id: user.id,
        recipient_id: selectedTx.receiver_id,
        amount: selectedTx.amount,
        reason: reason || "Sent to wrong user",
      });

      if (error) throw error;

      toast({ title: "Reversal Requested", description: "An admin or agent will review your request. Funds will be returned within 1 hour after approval." });
      setSelectedTx(null);
      setReason("");
      fetchData();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <span className="flex items-center gap-1 text-xs text-yellow-600"><Clock size={12} /> Pending</span>;
      case "approved": return <span className="flex items-center gap-1 text-xs text-blue-600"><AlertTriangle size={12} /> Approved - Returning in 1h</span>;
      case "completed": return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={12} /> Completed</span>;
      case "rejected": return <span className="flex items-center gap-1 text-xs text-destructive"><XCircle size={12} /> Rejected</span>;
      default: return null;
    }
  };

  const alreadyRequested = (txId: string) => myReversals.some(r => r.transaction_id === txId);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate("/client")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Request Fund Reversal</h1>

        {/* My reversal requests */}
        {myReversals.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">My Reversal Requests</h2>
            <div className="space-y-2">
              {myReversals.map((rev) => (
                <Card key={rev.id} className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">${rev.amount}</p>
                      <p className="text-xs text-muted-foreground">{rev.reason}</p>
                      <p className="text-xs text-muted-foreground">{new Date(rev.requested_at).toLocaleString()}</p>
                    </div>
                    {getStatusBadge(rev.status)}
                  </div>
                  {rev.status === "approved" && rev.funds_held_at && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Funds return at: {new Date(new Date(rev.funds_held_at).getTime() + 60 * 60 * 1000).toLocaleString()}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Select transaction to reverse */}
        <h2 className="text-lg font-semibold mb-3">Recent Sent Transactions</h2>
        <p className="text-sm text-muted-foreground mb-4">Select a transaction you sent to the wrong person to request a reversal.</p>

        <div className="space-y-2 mb-4">
          {transactions.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground">No sent transactions found</p>
            </Card>
          ) : (
            transactions.map((tx) => (
              <Card
                key={tx.id}
                className={`p-4 cursor-pointer transition-colors ${selectedTx?.id === tx.id ? "ring-2 ring-primary" : ""} ${alreadyRequested(tx.id) ? "opacity-50" : ""}`}
                onClick={() => !alreadyRequested(tx.id) && setSelectedTx(tx)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">${tx.amount}</p>
                    <p className="text-xs text-muted-foreground">To: {tx.receiver_id.slice(0, 8)}...</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</p>
                  </div>
                  {alreadyRequested(tx.id) ? (
                    <span className="text-xs text-muted-foreground">Requested</span>
                  ) : (
                    <RotateCcw size={16} className="text-muted-foreground" />
                  )}
                </div>
              </Card>
            ))
          )}
        </div>

        {selectedTx && (
          <Card className="p-4 space-y-3">
            <div>
              <Label>Reason for Reversal</Label>
              <Input
                placeholder="e.g. Sent to wrong person"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleRequest} disabled={loading}>
              {loading ? "Submitting..." : `Request Reversal of $${selectedTx.amount}`}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              An admin or agent will review your request. If approved, funds are deducted from the recipient immediately and returned to you within 1 hour.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default RequestReversal;

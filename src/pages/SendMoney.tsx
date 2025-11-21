import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { QRScanner } from "@/components/QRScanner";
import { ArrowLeft, QrCode, User } from "lucide-react";

const SendMoney = () => {
  const [amount, setAmount] = useState("");
  const [receiverId, setReceiverId] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleScanSuccess = async (userId: string) => {
    setReceiverId(userId);
    setShowScanner(false);
    
    // Fetch receiver's name
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();
    
    if (data) {
      setReceiverName(data.full_name || "Unknown User");
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("process_transaction", {
        _sender_id: user.id,
        _receiver_id: receiverId,
        _amount: parseFloat(amount),
        _transaction_type: "transfer",
        _description: "Money transfer"
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; fee?: number };
      
      if (result.success) {
        toast({
          title: "Transfer Successful",
          description: `Sent $${amount} to ${receiverName}. Fee: $${result.fee?.toFixed(2)}`,
        });
        navigate("/client-dashboard");
      } else {
        toast({
          title: "Transfer Failed",
          description: result.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/client-dashboard")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Send Money</h1>

        {showScanner ? (
          <QRScanner
            onScanSuccess={handleScanSuccess}
            onClose={() => setShowScanner(false)}
          />
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <Label>Receiver</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="User ID or Name"
                    value={receiverName || receiverId}
                    onChange={(e) => setReceiverId(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowScanner(true)}
                  >
                    <QrCode size={20} />
                  </Button>
                </div>
                {receiverName && (
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                    <User size={14} />
                    {receiverName}
                  </p>
                )}
              </div>

              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Processing..." : "Send Money"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SendMoney;

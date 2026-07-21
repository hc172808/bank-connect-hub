import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Store, QrCode, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRScanner } from "@/components/QRScanner";
import { supabase } from "@/integrations/supabase/client";
import { awardPoints } from "@/lib/rewards";

const PayMerchant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [merchantId, setMerchantId] = useState("");
  const [amount, setAmount] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);

  const handleScanSuccess = (userId: string) => {
    setMerchantId(userId);
    setShowScanner(false);
    toast({
      title: "Merchant Found",
      description: `Merchant ID: ${userId.slice(0, 8)}…`,
    });
  };

  const handlePay = async () => {
    if (!merchantId || !amount) {
      toast({ variant: "destructive", title: "Error", description: "Please fill in all fields" });
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Enter a valid amount" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("process_transaction", {
        _sender_id: user.id,
        _receiver_id: merchantId,
        _amount: amt,
        _transaction_type: "transfer",
        _description: `Merchant payment — ID: ${merchantId.slice(0, 8)}`,
      });

      const result = data as { success?: boolean; error?: string } | null;
      if (error || !result?.success) {
        throw new Error(result?.error || error?.message || "Payment failed");
      }

      awardPoints(user.id, amt, "merchant_payment");
      setPaidAmount(amt);
      setPaid(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Payment Failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
          <p className="text-muted-foreground mb-2">
            <strong>${paidAmount.toFixed(2)}</strong> paid to merchant.
          </p>
          <p className="text-xs text-muted-foreground mb-6">Points earned on this payment!</p>
          <Button className="w-full" onClick={() => navigate("/client")}>Done</Button>
          <Button variant="outline" className="w-full mt-2" onClick={() => { setPaid(false); setMerchantId(""); setAmount(""); }}>
            Pay Another
          </Button>
        </div>
      </div>
    );
  }

  if (showScanner) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button variant="ghost" onClick={() => setShowScanner(false)} className="mb-4">
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>
          <QRScanner onScanSuccess={handleScanSuccess} onClose={() => setShowScanner(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate("/client")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Pay Merchant</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store size={24} />
              Merchant Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => setShowScanner(true)} className="w-full h-16 gap-2">
              <QrCode size={24} />
              Scan Merchant QR Code
            </Button>

            <div className="text-center text-muted-foreground">or</div>

            <div>
              <label className="text-sm font-medium mb-2 block">Merchant ID</label>
              <Input
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="Enter merchant ID"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Amount</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>

            <Button onClick={handlePay} className="w-full h-12" disabled={loading}>
              {loading ? "Processing…" : "Pay Now"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PayMerchant;

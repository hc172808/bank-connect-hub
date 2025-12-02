import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { QRScanner } from "@/components/QRScanner";

const ScanToPay = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scannedUserId, setScannedUserId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleScanSuccess = (userId: string) => {
    setScannedUserId(userId);
    toast({
      title: "User Found",
      description: `Ready to pay user`,
    });
  };

  const handlePay = async () => {
    if (!scannedUserId || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please scan a QR code and enter amount",
      });
      return;
    }

    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please login first",
      });
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc("process_transaction", {
      _sender_id: user.id,
      _receiver_id: scannedUserId,
      _amount: parseFloat(amount),
      _transaction_type: "transfer",
      _description: `QR Payment`,
    });

    const result = data as { success?: boolean; error?: string } | null;

    if (error || !result?.success) {
      toast({
        variant: "destructive",
        title: "Payment Failed",
        description: error?.message || result?.error || "Transaction failed",
      });
    } else {
      toast({
        title: "Payment Successful",
        description: `$${amount} sent successfully`,
      });
      navigate("/client");
    }

    setLoading(false);
  };

  if (!scannedUserId) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/client")}
            className="mb-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>

          <h1 className="text-2xl font-bold mb-6">Scan to Pay</h1>

          <QRScanner onScanSuccess={handleScanSuccess} />

          <p className="text-sm text-muted-foreground text-center mt-6">
            Point your camera at a QR code to scan and pay
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => setScannedUserId(null)}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Scan Again
        </Button>

        <h1 className="text-2xl font-bold mb-6">Complete Payment</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode size={24} />
              Payment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-xl">
              <p className="text-sm text-muted-foreground">Paying to</p>
              <p className="text-lg font-bold">{scannedUserId.slice(0, 8)}...</p>
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

            <Button
              onClick={handlePay}
              disabled={loading}
              className="w-full h-12"
            >
              {loading ? "Processing..." : `Pay $${amount || "0"}`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ScanToPay;

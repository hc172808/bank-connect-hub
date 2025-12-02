import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Store, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QRScanner } from "@/components/QRScanner";

const PayMerchant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [merchantId, setMerchantId] = useState("");
  const [amount, setAmount] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  const handleScanSuccess = (userId: string) => {
    setMerchantId(userId);
    setShowScanner(false);
    toast({
      title: "Merchant Found",
      description: `Merchant ID: ${userId.slice(0, 8)}`,
    });
  };

  const handlePay = () => {
    if (!merchantId || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all fields",
      });
      return;
    }

    toast({
      title: "Payment Successful",
      description: `$${amount} paid to merchant`,
    });
    navigate("/client");
  };

  if (showScanner) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            onClick={() => setShowScanner(false)}
            className="mb-4"
          >
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
        <Button
          variant="ghost"
          onClick={() => navigate("/client")}
          className="mb-4"
        >
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
            <Button
              variant="outline"
              onClick={() => setShowScanner(true)}
              className="w-full h-16 gap-2"
            >
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

            <Button onClick={handlePay} className="w-full h-12">
              Pay Now
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PayMerchant;

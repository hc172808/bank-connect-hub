import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, QrCode, CreditCard, Wallet, ArrowDownLeft, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { QRScanner } from "@/components/QRScanner";
import { PinInput } from "@/components/PinInput";
import { TransactionReceipt } from "@/components/TransactionReceipt";
import { SetPinDialog } from "@/components/SetPinDialog";

type ActionType = "pay" | "check_balance" | "receive" | null;
type Step = "scan" | "options" | "pin" | "amount" | "receipt";

interface ScannedUser {
  userId: string;
  walletAddress?: string;
  name?: string;
}

interface ReceiptData {
  success: boolean;
  type: "payment" | "balance_check" | "receive";
  amount?: number;
  balance?: number;
  recipientName?: string;
  transactionId?: string;
  fee?: number;
}

const ScanToPay = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("scan");
  const [scannedUser, setScannedUser] = useState<ScannedUser | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionType>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [showSetPinDialog, setShowSetPinDialog] = useState(false);
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  const handleScanSuccess = async (data: string) => {
    try {
      // Try to parse JSON QR data
      const parsed = JSON.parse(data);
      const userId = parsed.userId;
      
      // Fetch user info
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, pin_hash")
        .eq("id", userId)
        .single();
      
      setScannedUser({
        userId,
        walletAddress: parsed.walletAddress,
        name: profile?.full_name || "User"
      });
      
      // Check if scanned user has PIN set
      setHasPin(!!profile?.pin_hash);
      setStep("options");
    } catch {
      // Legacy QR format (just user ID)
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, pin_hash")
        .eq("id", data)
        .single();
      
      setScannedUser({
        userId: data,
        name: profile?.full_name || "User"
      });
      setHasPin(!!profile?.pin_hash);
      setStep("options");
    }
    
    toast({
      title: "User Found",
      description: "Select an action to continue",
    });
  };

  const handleActionSelect = (action: ActionType) => {
    setSelectedAction(action);
    
    // Check balance doesn't require PIN for the scanner
    // But other actions require the QR owner's PIN
    if (action === "check_balance" || action === "receive") {
      if (!hasPin) {
        toast({
          variant: "destructive",
          title: "No PIN Set",
          description: "The account owner needs to set a PIN first",
        });
        return;
      }
      setStep("pin");
    } else if (action === "pay") {
      setStep("amount");
    }
  };

  const handlePinVerified = async () => {
    if (selectedAction === "check_balance") {
      await handleCheckBalance();
    } else if (selectedAction === "receive") {
      setStep("amount");
    }
  };

  const handleCheckBalance = async () => {
    if (!scannedUser) return;
    
    setLoading(true);
    
    const { data } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", scannedUser.userId)
      .single();
    
    setReceiptData({
      success: true,
      type: "balance_check",
      balance: data?.balance || 0
    });
    setStep("receipt");
    setLoading(false);
  };

  const handlePayment = async () => {
    if (!scannedUser || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter an amount",
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
      _receiver_id: scannedUser.userId,
      _amount: parseFloat(amount),
      _transaction_type: "transfer",
      _description: `QR Payment to ${scannedUser.name}`,
    });

    const result = data as { success?: boolean; error?: string } | null;

    if (error || !result?.success) {
      setReceiptData({
        success: false,
        type: "payment",
        amount: parseFloat(amount),
        recipientName: scannedUser.name
      });
    } else {
      setReceiptData({
        success: true,
        type: "payment",
        amount: parseFloat(amount),
        recipientName: scannedUser.name,
        fee: 0
      });
    }
    
    setStep("receipt");
    setLoading(false);
  };

  const handleReceiveFunds = async () => {
    if (!scannedUser || !amount) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter an amount",
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

    // The scanner (sender) sends money to the QR owner (receiver)
    const { data, error } = await supabase.rpc("process_transaction", {
      _sender_id: user.id,
      _receiver_id: scannedUser.userId,
      _amount: parseFloat(amount),
      _transaction_type: "transfer",
      _description: `QR Receive from ${user.email}`,
    });

    const result = data as { success?: boolean; error?: string } | null;

    if (error || !result?.success) {
      setReceiptData({
        success: false,
        type: "receive",
        amount: parseFloat(amount)
      });
    } else {
      setReceiptData({
        success: true,
        type: "receive",
        amount: parseFloat(amount)
      });
    }
    
    setStep("receipt");
    setLoading(false);
  };

  const handleDone = () => {
    navigate("/client");
  };

  const resetFlow = () => {
    setStep("scan");
    setScannedUser(null);
    setSelectedAction(null);
    setAmount("");
    setReceiptData(null);
  };

  // Step: Scan QR
  if (step === "scan") {
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

          <h1 className="text-2xl font-bold mb-6">Scan QR Code</h1>

          <QRScanner onScanSuccess={handleScanSuccess} />

          <p className="text-sm text-muted-foreground text-center mt-6">
            Point your camera at a user's QR code to pay, check balance, or receive funds
          </p>

          <SetPinDialog
            open={showSetPinDialog}
            onOpenChange={setShowSetPinDialog}
            onPinSet={() => {}}
          />
        </div>
      </div>
    );
  }

  // Step: Receipt
  if (step === "receipt" && receiptData) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <TransactionReceipt {...receiptData} onDone={handleDone} />
      </div>
    );
  }

  // Step: Options
  if (step === "options") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            onClick={resetFlow}
            className="mb-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Scan Again
          </Button>

          <h1 className="text-2xl font-bold mb-6">What would you like to do?</h1>

          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User size={24} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{scannedUser?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {scannedUser?.userId.slice(0, 12)}...
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <Button
              onClick={() => handleActionSelect("pay")}
              className="w-full h-16 justify-start gap-4"
              variant="outline"
            >
              <CreditCard size={24} />
              <div className="text-left">
                <p className="font-semibold">Pay Bill / Send Money</p>
                <p className="text-xs text-muted-foreground">Send GYD to this user</p>
              </div>
            </Button>

            <Button
              onClick={() => handleActionSelect("check_balance")}
              className="w-full h-16 justify-start gap-4"
              variant="outline"
            >
              <Wallet size={24} />
              <div className="text-left">
                <p className="font-semibold">Check Balance</p>
                <p className="text-xs text-muted-foreground">View account balance (requires PIN)</p>
              </div>
            </Button>

            <Button
              onClick={() => handleActionSelect("receive")}
              className="w-full h-16 justify-start gap-4"
              variant="outline"
            >
              <ArrowDownLeft size={24} />
              <div className="text-left">
                <p className="font-semibold">Receive Funds</p>
                <p className="text-xs text-muted-foreground">Receive GYD from scanner (requires PIN)</p>
              </div>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step: PIN Verification
  if (step === "pin" && scannedUser) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button
            variant="ghost"
            onClick={() => setStep("options")}
            className="mb-4"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back
          </Button>

          <Card>
            <CardContent className="pt-6">
              <PinInput
                userId={scannedUser.userId}
                onVerified={handlePinVerified}
                onCancel={() => setStep("options")}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Step: Amount Entry
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => setStep("options")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">
          {selectedAction === "pay" ? "Send Payment" : "Receive Funds"}
        </h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode size={24} />
              {selectedAction === "pay" ? "Payment Details" : "Receive Details"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-xl">
              <p className="text-sm text-muted-foreground">
                {selectedAction === "pay" ? "Paying to" : "Receiving from scanner to"}
              </p>
              <p className="text-lg font-bold">{scannedUser?.name}</p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Amount (GYD)</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                min="0"
                step="0.01"
              />
            </div>

            <Button
              onClick={selectedAction === "pay" ? handlePayment : handleReceiveFunds}
              disabled={loading}
              className="w-full h-12"
            >
              {loading 
                ? "Processing..." 
                : selectedAction === "pay"
                  ? `Pay $${amount || "0"}`
                  : `Receive $${amount || "0"}`
              }
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ScanToPay;

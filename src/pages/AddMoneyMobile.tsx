import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Smartphone, Copy, Phone } from "lucide-react";

interface MobileProvider {
  name: string;
  ussdCode: string;
  logo: string;
  color: string;
}

const providers: MobileProvider[] = [
  { name: "Digicel MoMo", ussdCode: "*129#", logo: "D", color: "bg-red-500" },
  { name: "GTT Mobile Money", ussdCode: "*888#", logo: "G", color: "bg-green-600" },
  { name: "M-Pesa", ussdCode: "*234#", logo: "M", color: "bg-green-500" },
  { name: "Other Provider", ussdCode: "", logo: "?", color: "bg-muted-foreground" },
];

const AddMoneyMobile = () => {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<MobileProvider | null>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [step, setStep] = useState<"select" | "details" | "confirm">("select");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const handleSubmit = async () => {
    if (!amount || !phone || !selectedProvider) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100000) {
      toast({ title: "Error", description: "Please enter a valid amount (1 - 100,000)", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create a pending deposit for admin verification
      await supabase.from("pending_deposits").insert({
        agent_id: user.id,
        user_id: user.id,
        amount: parsedAmount,
        status: "pending",
      });

      // Record transaction as pending
      await supabase.from("transactions").insert({
        sender_id: user.id,
        receiver_id: user.id,
        amount: parsedAmount,
        fee: 0,
        status: "pending",
        transaction_type: "deposit",
        description: `Mobile Money deposit via ${selectedProvider.name}${transactionRef ? ` (Ref: ${transactionRef})` : ""}`,
      });

      setStep("confirm");
      toast({ title: "Deposit Submitted", description: "Your mobile money deposit is being verified." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button variant="ghost" onClick={() => navigate("/client")} className="mb-4">
            <ArrowLeft size={20} className="mr-2" /> Back to Home
          </Button>
          <Card className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Smartphone size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold">Deposit Pending</h2>
            <p className="text-muted-foreground">
              Your mobile money deposit of <strong>${amount}</strong> via <strong>{selectedProvider?.name}</strong> has been submitted.
            </p>
            <p className="text-sm text-muted-foreground">
              An admin will verify the payment and credit your wallet. This usually takes a few minutes.
            </p>
            <Button onClick={() => navigate("/client")} className="w-full">Back to Dashboard</Button>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "details" && selectedProvider) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button variant="ghost" onClick={() => setStep("select")} className="mb-4">
            <ArrowLeft size={20} className="mr-2" /> Back
          </Button>

          <h1 className="text-2xl font-bold mb-4">Mobile Money Deposit</h1>

          {/* USSD Instructions */}
          {selectedProvider.ussdCode && (
            <Card className="mb-4 bg-primary/5 border-primary/20">
              <CardContent className="p-4 space-y-3">
                <p className="font-semibold text-sm">USSD Instructions</p>
                <ol className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">1.</span>
                    Dial <strong className="text-foreground">{selectedProvider.ussdCode}</strong> on your phone
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">2.</span>
                    Select "Send Money" or "Pay Merchant"
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">3.</span>
                    Enter the GYD merchant number: <strong className="text-foreground">+592-000-0001</strong>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">4.</span>
                    Enter the amount and confirm
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-foreground">5.</span>
                    Enter the transaction reference below
                  </li>
                </ol>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => copyToClipboard(selectedProvider.ussdCode, "USSD code")}
                  >
                    <Copy size={12} className="mr-1" /> Copy USSD
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => copyToClipboard("+5920000001", "Merchant number")}
                  >
                    <Copy size={12} className="mr-1" /> Copy Number
                  </Button>
                  {selectedProvider.ussdCode && (
                    <a href={`tel:${encodeURIComponent(selectedProvider.ussdCode)}`}>
                      <Button size="sm" variant="outline" className="text-xs">
                        <Phone size={12} className="mr-1" /> Dial
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className={`w-8 h-8 ${selectedProvider.color} rounded-full flex items-center justify-center text-white text-sm font-bold`}>
                  {selectedProvider.logo}
                </div>
                {selectedProvider.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max="100000"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label>Your Mobile Number</Label>
                <Input
                  type="tel"
                  placeholder="+592 000 0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+\-\s]/g, "").slice(0, 20))}
                  required
                />
              </div>

              <div>
                <Label>Transaction Reference (from your receipt)</Label>
                <Input
                  placeholder="e.g. TXN123456789"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value.replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 30))}
                />
                <p className="text-xs text-muted-foreground mt-1">Optional — helps speed up verification</p>
              </div>

              <Button className="w-full" onClick={handleSubmit} disabled={loading}>
                {loading ? "Submitting..." : `Submit Deposit of $${amount || "0.00"}`}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Complete the mobile money payment first, then submit here for verification.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Step: select provider
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate("/add-money")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-4">Mobile Money / USSD</h1>
        <p className="text-muted-foreground mb-6">Select your mobile money provider to get started.</p>

        <div className="space-y-3">
          {providers.map((provider) => (
            <button
              key={provider.name}
              onClick={() => { setSelectedProvider(provider); setStep("details"); }}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
            >
              <div className={`w-12 h-12 ${provider.color} rounded-full flex items-center justify-center text-white text-lg font-bold`}>
                {provider.logo}
              </div>
              <div>
                <p className="font-medium">{provider.name}</p>
                {provider.ussdCode && (
                  <p className="text-sm text-muted-foreground">Dial {provider.ussdCode}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AddMoneyMobile;

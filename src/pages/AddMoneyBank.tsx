import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building, Copy } from "lucide-react";

const AddMoneyBank = () => {
  const [amount, setAmount] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Platform bank details (would come from admin settings in production)
  const bankDetails = {
    bankName: "GYD National Bank",
    accountName: "GYD Digital Wallet Ltd",
    accountNumber: "1234567890",
    routingNumber: "021000021",
    swiftCode: "GYDNGYDK",
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) {
      toast({ title: "Error", description: "Please enter an amount", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create a pending deposit that admin will approve
      await supabase.from("pending_deposits").insert({
        agent_id: user.id,
        user_id: user.id,
        amount: parseFloat(amount),
        status: "pending",
      });

      setSubmitted(true);
      toast({ title: "Transfer Initiated", description: "Once you complete the bank transfer, an admin will verify and credit your account." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-md mx-auto">
          <Button variant="ghost" onClick={() => navigate("/client")} className="mb-4">
            <ArrowLeft size={20} className="mr-2" /> Back to Home
          </Button>

          <Card className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Building size={32} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold">Transfer Pending</h2>
            <p className="text-muted-foreground">
              Please complete your bank transfer of <strong>${amount}</strong> using the bank details provided. Your account will be credited once the transfer is verified by an admin.
            </p>
            <p className="text-sm text-muted-foreground">This usually takes 1-2 business days.</p>
            <Button onClick={() => navigate("/client")} className="w-full">
              Back to Dashboard
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate("/add-money")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <h1 className="text-2xl font-bold mb-6">Add via Bank Transfer</h1>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building size={20} /> Bank Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: "Bank Name", value: bankDetails.bankName },
              { label: "Account Name", value: bankDetails.accountName },
              { label: "Account Number", value: bankDetails.accountNumber },
              { label: "Routing Number", value: bankDetails.routingNumber },
              { label: "SWIFT Code", value: bankDetails.swiftCode },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="font-medium">{item.value}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(item.value, item.label)}
                >
                  <Copy size={14} />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transfer Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label>Reference Note (optional)</Label>
                <Input
                  placeholder="Your name or reference"
                  value={referenceNote}
                  onChange={(e) => setReferenceNote(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Submitting..." : "I've Made the Transfer"}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Transfer the exact amount above to the bank details shown. Include your reference note for faster verification.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AddMoneyBank;

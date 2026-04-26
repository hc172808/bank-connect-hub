import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, DollarSign, Receipt, RefreshCw, CheckCircle2, Copy, Share2 } from "lucide-react";

interface ProfileData {
  full_name: string | null;
  store_name: string | null;
  wallet_address: string | null;
}

interface IncomingPayment {
  id: string;
  amount: number;
  created_at: string;
  sender_id: string;
}

const POLL_INTERVAL_MS = 4000;

const VendorCharge = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [chargeStartedAt, setChargeStartedAt] = useState<number | null>(null);
  const [paid, setPaid] = useState<IncomingPayment | null>(null);

  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, store_name, wallet_address")
        .eq("id", user.id)
        .single();
      if (data) setProfile(data as ProfileData);
    };
    fetchProfile();
  }, [user]);

  // Poll for incoming payment matching the requested amount
  useEffect(() => {
    if (!chargeStartedAt || !user || paid) return;
    startedRef.current = chargeStartedAt;
    const targetAmount = parseFloat(amount);
    if (!targetAmount) return;

    const tick = async () => {
      if (!user || startedRef.current !== chargeStartedAt) return;
      const sinceIso = new Date(chargeStartedAt - 10_000).toISOString();
      const { data } = await supabase
        .from("transactions")
        .select("id, amount, created_at, sender_id")
        .eq("receiver_id", user.id)
        .eq("status", "completed")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(5);

      if (data) {
        const match = (data as IncomingPayment[]).find(
          (t) => Math.abs(Number(t.amount) - targetAmount) < 0.005
        );
        if (match && startedRef.current === chargeStartedAt) {
          setPaid(match);
          toast({
            title: "Payment received",
            description: `$${match.amount.toFixed(2)} just landed in your wallet.`,
          });
        }
      }
    };

    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [chargeStartedAt, user, amount, paid, toast]);

  const startCharge = () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      toast({ variant: "destructive", title: "Enter an amount" });
      return;
    }
    setPaid(null);
    setChargeStartedAt(Date.now());
  };

  const reset = () => {
    setChargeStartedAt(null);
    setPaid(null);
    setAmount("");
    setDescription("");
    startedRef.current = null;
  };

  const qrPayload = chargeStartedAt && user
    ? JSON.stringify({
        type: "charge_request",
        userId: user.id,
        walletAddress: profile?.wallet_address || null,
        amount: parseFloat(amount),
        description: description || `Payment to ${profile?.store_name || profile?.full_name || "vendor"}`,
        merchantName: profile?.store_name || profile?.full_name || "",
        issuedAt: chargeStartedAt,
      })
    : null;

  const copyLink = () => {
    if (!qrPayload) return;
    navigator.clipboard.writeText(qrPayload);
    toast({ title: "Copied", description: "Payment request copied." });
  };

  const sharePayload = async () => {
    if (!qrPayload) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Payment request",
          text: `${profile?.store_name || "Vendor"} requests $${amount}`,
        });
      } else {
        copyLink();
      }
    } catch {
      copyLink();
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate("/vendor")} className="mb-4" data-testid="button-back">
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Receipt className="text-primary" />
          Charge a Customer
        </h1>
        <p className="text-muted-foreground mb-6">
          Enter an amount and let the customer scan to pay.
        </p>

        {!chargeStartedAt ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New charge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Amount *</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-10 text-lg font-semibold"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    data-testid="input-amount"
                  />
                </div>
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. 2x coffees, table 5"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-note"
                />
              </div>
              <Button onClick={startCharge} className="w-full" size="lg" data-testid="button-start-charge">
                Generate payment QR
              </Button>
            </CardContent>
          </Card>
        ) : paid ? (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="py-8 text-center space-y-3">
              <CheckCircle2 className="mx-auto text-green-600" size={64} />
              <h2 className="text-2xl font-bold">Payment received</h2>
              <p className="text-3xl font-bold">${paid.amount.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">
                Tx ID: <span className="font-mono">{paid.id.slice(0, 8).toUpperCase()}</span>
              </p>
              <div className="flex gap-2 pt-2">
                <Button onClick={reset} className="flex-1" data-testid="button-new-charge">
                  New charge
                </Button>
                <Button variant="outline" onClick={() => navigate("/transactions")} className="flex-1">
                  View transactions
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Awaiting payment</span>
                <span className="text-2xl font-bold">${parseFloat(amount).toFixed(2)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-xl border-2 border-primary/30 shadow-md">
                  {qrPayload && <QRCodeSVG value={qrPayload} size={220} />}
                </div>
              </div>
              {description && (
                <p className="text-sm text-center text-muted-foreground italic">"{description}"</p>
              )}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <RefreshCw size={14} className="animate-spin" />
                Waiting for the customer to scan and pay…
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={sharePayload} className="gap-2" data-testid="button-share">
                  <Share2 size={16} /> Share
                </Button>
                <Button variant="outline" onClick={copyLink} className="gap-2" data-testid="button-copy">
                  <Copy size={16} /> Copy
                </Button>
              </div>

              <Button variant="ghost" onClick={reset} className="w-full" data-testid="button-cancel">
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default VendorCharge;

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft, Smartphone, Wifi, WifiOff, QrCode, CheckCircle2,
  AlertTriangle, Loader2, DollarSign, RefreshCw, Info,
} from "lucide-react";
import QRCode from "qrcode";

type NFCState = "idle" | "scanning" | "reading" | "success" | "error";

interface NFCPayload {
  type: "payment_request";
  amount: number;
  currency: string;
  merchant: string;
  ref: string;
}

const NFC_SUPPORTED = "NDEFReader" in window;

export default function NFCTapPayment() {
  const navigate = useNavigate();
  const [nfcState, setNfcState] = useState<NFCState>("idle");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [balance, setBalance] = useState(0);
  const [tab, setTab] = useState<"tap" | "qr">(NFC_SUPPORTED ? "tap" : "qr");
  const [processing, setProcessing] = useState(false);
  const readerRef = useRef<unknown>(null);

  useEffect(() => {
    loadBalance();
    return () => { stopNFC(); };
  }, []);

  useEffect(() => {
    if (tab === "qr" && amount && recipient) generateQR();
  }, [amount, recipient, tab]);

  const loadBalance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase
        .from("wallets") as any).select("balance")
        .eq("user_id", user.id).eq("wallet_type", "main").single();
      setBalance((data as { balance: number } | null)?.balance || 0);
    } catch {}
  };

  const generateQR = async () => {
    if (!amount || !recipient) return;
    const payload: NFCPayload = {
      type: "payment_request",
      amount: parseFloat(amount),
      currency: "USD",
      merchant: recipient,
      ref: `QR-${Date.now()}`,
    };
    try {
      const url = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 256, margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      });
      setQrDataUrl(url);
    } catch {}
  };

  const startNFC = async () => {
    if (!NFC_SUPPORTED) {
      toast.error("NFC not supported on this device/browser");
      setTab("qr");
      return;
    }
    setNfcState("scanning");
    try {
      const NDEFReader = (window as unknown as { NDEFReader: new () => unknown }).NDEFReader;
      const reader = new NDEFReader() as {
        scan: () => Promise<void>;
        onreading: ((event: { message: { records: Array<{ recordType: string; data: BufferSource }> } }) => void) | null;
        onerror: ((event: Event) => void) | null;
        abort?: () => void;
      };
      readerRef.current = reader;
      await reader.scan();
      setNfcState("reading");

      reader.onreading = (event) => {
        setNfcState("reading");
        for (const record of event.message.records) {
          if (record.recordType === "text") {
            const decoder = new TextDecoder();
            const text = decoder.decode(record.data);
            try {
              const payload = JSON.parse(text) as NFCPayload;
              if (payload.type === "payment_request") {
                processNFCPayment(payload);
                return;
              }
            } catch {}
          }
        }
        toast.error("Unrecognized NFC tag");
        setNfcState("idle");
      };

      reader.onerror = () => {
        setNfcState("error");
        toast.error("NFC read error — try again");
      };
    } catch (err) {
      setNfcState("error");
      const msg = err instanceof Error ? err.message : "NFC unavailable";
      toast.error(msg.includes("permission") ? "NFC permission denied — check browser settings" : msg);
    }
  };

  const stopNFC = () => {
    const reader = readerRef.current as { abort?: () => void } | null;
    if (reader?.abort) reader.abort();
    readerRef.current = null;
    setNfcState("idle");
  };

  const processNFCPayment = async (payload: NFCPayload) => {
    stopNFC();
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (payload.amount > balance) {
        toast.error("Insufficient balance");
        setNfcState("idle");
        setProcessing(false);
        return;
      }

      await supabase.from("transactions").insert({
        sender_id: user.id,
        amount: payload.amount,
        transaction_type: "nfc_payment",
        description: `NFC Payment to ${payload.merchant}`,
        status: "completed",
        reference: payload.ref,
      } as never);

      setNfcState("success");
      toast.success(`Payment of $${payload.amount} to ${payload.merchant} complete!`);
      loadBalance();
    } catch (err) {
      toast.error("Payment failed");
      setNfcState("error");
    }
    setProcessing(false);
  };

  const manualPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (!recipient.trim()) { toast.error("Enter a recipient"); return; }
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (parseFloat(amount) > balance) { toast.error("Insufficient balance"); setProcessing(false); return; }

      await supabase.from("transactions").insert({
        sender_id: user.id,
        amount: parseFloat(amount),
        transaction_type: "nfc_payment",
        description: `Tap Payment to ${recipient}`,
        status: "completed",
        reference: `TAP-${Date.now()}`,
      } as never);

      toast.success(`Paid $${amount} to ${recipient}!`);
      setAmount("");
      setRecipient("");
      setQrDataUrl("");
      loadBalance();
    } catch { toast.error("Payment failed"); }
    setProcessing(false);
  };

  const nfcIcon = nfcState === "scanning" || nfcState === "reading"
    ? <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
    : nfcState === "success"
    ? <CheckCircle2 className="h-12 w-12 text-green-500" />
    : nfcState === "error"
    ? <AlertTriangle className="h-12 w-12 text-red-500" />
    : <Wifi className="h-12 w-12 text-primary" />;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="bg-gradient-to-r from-cyan-600 to-blue-600 text-white p-4">
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-black flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> NFC Tap Payments
            </h1>
            <p className="text-xs text-white/70">Contactless payments — tap your phone to pay</p>
          </div>
        </div>
        <div className="flex items-center justify-between bg-white/15 rounded-xl p-3 mt-2">
          <div>
            <p className="text-xs text-white/70">Available Balance</p>
            <p className="text-xl font-black">${balance.toFixed(2)}</p>
          </div>
          <Badge className={NFC_SUPPORTED ? "bg-green-500/30 text-green-200" : "bg-red-500/30 text-red-200"}>
            {NFC_SUPPORTED ? "NFC Ready" : "NFC Unavailable"}
          </Badge>
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 border rounded-xl p-1 bg-muted">
          <Button
            size="sm"
            variant={tab === "tap" ? "default" : "ghost"}
            className="flex-1 gap-2"
            onClick={() => setTab("tap")}
          >
            <Wifi className="h-4 w-4" /> NFC Tap
          </Button>
          <Button
            size="sm"
            variant={tab === "qr" ? "default" : "ghost"}
            className="flex-1 gap-2"
            onClick={() => setTab("qr")}
          >
            <QrCode className="h-4 w-4" /> QR Code
          </Button>
        </div>

        {/* NFC Tab */}
        {tab === "tap" && (
          <>
            {!NFC_SUPPORTED && (
              <Card className="border-yellow-300 bg-yellow-50/50">
                <CardContent className="p-4 flex gap-3">
                  <WifiOff className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-700">NFC not supported</p>
                    <p className="text-xs text-yellow-600">Your browser or device doesn't support Web NFC. Use the QR Code tab as a fallback, or open this page in Chrome on an Android device with NFC enabled.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-6 flex flex-col items-center gap-4">
                <div className={`w-28 h-28 rounded-full flex items-center justify-center border-4 transition-all ${
                  nfcState === "scanning" || nfcState === "reading" ? "border-blue-400 bg-blue-50 animate-pulse" :
                  nfcState === "success" ? "border-green-400 bg-green-50" :
                  nfcState === "error" ? "border-red-400 bg-red-50" :
                  "border-dashed border-muted-foreground/30 bg-muted/30"
                }`}>
                  {nfcIcon}
                </div>
                <div className="text-center">
                  <p className="font-bold text-base">
                    {nfcState === "idle" && "Ready to Tap"}
                    {nfcState === "scanning" && "Hold near NFC tag…"}
                    {nfcState === "reading" && "Reading tag…"}
                    {nfcState === "success" && "Payment Complete!"}
                    {nfcState === "error" && "Read Failed"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {nfcState === "idle" && (NFC_SUPPORTED ? "Tap an NFC payment terminal or tag to pay" : "NFC unavailable — use QR tab")}
                    {nfcState === "scanning" && "Keep your phone steady near the payment terminal"}
                    {nfcState === "reading" && "Processing payment data…"}
                    {nfcState === "success" && "Your payment was processed successfully"}
                    {nfcState === "error" && "Could not read NFC tag — try again"}
                  </p>
                </div>

                {nfcState === "idle" || nfcState === "error" ? (
                  <Button
                    onClick={startNFC}
                    disabled={!NFC_SUPPORTED || processing}
                    className="gap-2 w-full"
                  >
                    <Wifi className="h-4 w-4" />
                    {NFC_SUPPORTED ? "Start NFC Scan" : "NFC Unavailable"}
                  </Button>
                ) : nfcState === "scanning" || nfcState === "reading" ? (
                  <Button variant="outline" onClick={stopNFC} className="w-full gap-2">
                    Cancel Scan
                  </Button>
                ) : (
                  <Button onClick={() => { setNfcState("idle"); loadBalance(); }} className="w-full gap-2">
                    <RefreshCw className="h-4 w-4" /> New Payment
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Manual NFC amount */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Manual Tap Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" min="0.01" step="0.01" value={amount}
                    onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Recipient / Merchant</Label>
                  <Input value={recipient} onChange={e => setRecipient(e.target.value)}
                    placeholder="Merchant name or phone" className="h-9 mt-1" />
                </div>
                <Button onClick={manualPayment} disabled={processing} className="w-full gap-2">
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                  Pay Now
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* QR Tab */}
        {tab === "qr" && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Generate Payment QR</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Amount to Request</Label>
                  <Input type="number" min="0.01" step="0.01" value={amount}
                    onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Your Name / Business</Label>
                  <Input value={recipient} onChange={e => setRecipient(e.target.value)}
                    placeholder="Who is this for?" className="h-9 mt-1" />
                </div>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <img src={qrDataUrl} alt="Payment QR" className="w-48 h-48 rounded-xl border" />
                    <p className="text-xs text-muted-foreground text-center">
                      Show this QR code to the payer. They scan it to send <strong>${amount}</strong> to <strong>{recipient}</strong>.
                    </p>
                    <Button variant="outline" size="sm" onClick={generateQR} className="gap-1">
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                    </Button>
                  </div>
                )}
                {(!qrDataUrl) && (
                  <Button onClick={generateQR} disabled={!amount || !recipient} className="w-full gap-2">
                    <QrCode className="h-4 w-4" /> Generate QR
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="p-4 flex gap-3">
                <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 space-y-1">
                  <p className="font-semibold">How QR Payment Works</p>
                  <p>1. Enter amount + your name above</p>
                  <p>2. Show the QR to the person paying you</p>
                  <p>3. They scan it with their NETLIFE CASH app</p>
                  <p>4. Payment processes instantly</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

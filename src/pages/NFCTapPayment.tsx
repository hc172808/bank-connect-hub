import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { processPrivateLedgerTransfer } from "@/lib/privateLedger";
import {
  ArrowLeft, Smartphone, Wifi, WifiOff, QrCode, CheckCircle2,
  AlertTriangle, Loader2, DollarSign, RefreshCw, Info, X,
} from "lucide-react";
import QRCode from "qrcode";

type NFCState = "idle" | "scanning" | "reading" | "success" | "error";

interface NFCPayload {
  type: "payment_request" | "charge_request";
  amount: number;
  currency: string;
  merchant: string;
  ref: string;
  receiverId?: string;
}

interface RecipientProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
}

const NFC_SUPPORTED = typeof window !== "undefined"
  && window.isSecureContext
  && "NDEFReader" in window;

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeNfcRecord(record: { recordType: string; data: BufferSource }) {
  try {
    if (record.recordType === "text") {
      const bytes = record.data instanceof ArrayBuffer
        ? new Uint8Array(record.data)
        : new Uint8Array(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      // Web NFC text records begin with a status byte and a language code.
      const status = bytes[0] ?? 0;
      const languageLength = status & 0x3f;
      const textBytes = bytes.slice(1 + languageLength);
      return new TextDecoder(status & 0x80 ? "utf-16" : "utf-8").decode(textBytes).trim();
    }
    return new TextDecoder().decode(record.data).trim();
  } catch {
    return "";
  }
}

function parsePaymentPayload(text: string): NFCPayload | null {
  try {
    const parsed = JSON.parse(text) as Partial<NFCPayload> & { userId?: string };
    const receiverId = parsed.receiverId || parsed.userId;
    const amount = Number(parsed.amount);
    if (
      (parsed.type !== "payment_request" && parsed.type !== "charge_request")
      || !Number.isFinite(amount)
      || amount <= 0
      || !receiverId
      || !USER_ID_PATTERN.test(receiverId)
    ) {
      return null;
    }
    return {
      type: parsed.type,
      amount,
      currency: parsed.currency || "USD",
      merchant: parsed.merchant || "NETLIFE CASH merchant",
      ref: parsed.ref || `NFC-${Date.now()}`,
      receiverId,
    };
  } catch {
    return null;
  }
}

function recipientInitials(profile: RecipientProfile) {
  const name = profile.full_name?.trim();
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();
  }
  return profile.phone_number?.slice(-2) || "NC";
}

export default function NFCTapPayment() {
  const navigate = useNavigate();
  const [nfcState, setNfcState] = useState<NFCState>("idle");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientProfile | null>(null);
  const [recipientResults, setRecipientResults] = useState<RecipientProfile[]>([]);
  const [recipientSearching, setRecipientSearching] = useState(false);
  const [qrMerchantName, setQrMerchantName] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [balance, setBalance] = useState(0);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [tab, setTab] = useState<"tap" | "qr">(NFC_SUPPORTED ? "tap" : "qr");
  const [processing, setProcessing] = useState(false);
  const readerRef = useRef<{ controller: AbortController } | null>(null);

  useEffect(() => {
    void loadBalance();
    return () => { stopNFC(); };
  }, []);

  async function searchRecipients(query: string) {
    if (tab !== "tap" || recipientId || query.trim().length < 2) {
      setRecipientResults([]);
      setRecipientSearching(false);
      return;
    }
    setRecipientSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number, avatar_url")
      .or(`full_name.ilike.%${query.trim()}%,phone_number.ilike.%${query.trim()}%`)
      .limit(8);
    setRecipientResults((data || []).filter((candidate) => candidate.id !== userId));
    setRecipientSearching(false);
  }

  async function loadBalance() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const [{ data: wallet }, { data: profile }] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      const name = profile?.full_name || user.email || "NETLIFE CASH user";
      setUserName(name);
      setQrMerchantName((current) => current || name);
      setBalance(wallet?.balance || 0);
    } catch {
      toast.error("Could not load your wallet balance.");
    }
  }

  async function generateQR() {
    if (!amount || !userId || !qrMerchantName.trim()) return;
    const payload: NFCPayload = {
      type: "payment_request",
      amount: parseFloat(amount),
      currency: "USD",
      merchant: qrMerchantName.trim(),
      ref: `QR-${Date.now()}`,
      receiverId: userId,
    };
    try {
      const url = await QRCode.toDataURL(JSON.stringify(payload), {
        width: 256, margin: 2,
        color: { dark: "#1e1b4b", light: "#ffffff" },
      });
      setQrDataUrl(url);
    } catch {
      toast.error("Could not generate the payment QR code.");
    }
  }

  function handleRecipientChange(query: string) {
    setRecipient(query);
    void searchRecipients(query);
  }

  const startNFC = async () => {
    if (!NFC_SUPPORTED) {
      toast.error("NFC not supported on this device/browser");
      setTab("qr");
      return;
    }
    setNfcState("scanning");
    try {
      const NDEFReader = (window as unknown as { NDEFReader: new () => unknown }).NDEFReader;
      const controller = new AbortController();
      const reader = new NDEFReader() as {
        scan: (options?: { signal?: AbortSignal }) => Promise<void>;
        onreading: ((event: { message: { records: Array<{ recordType: string; data: BufferSource }> } }) => void) | null;
        onerror: ((event: Event) => void) | null;
      };
      readerRef.current = { controller };

      reader.onreading = (event) => {
        setNfcState("reading");
        for (const record of event.message.records) {
          const payload = parsePaymentPayload(decodeNfcRecord(record));
          if (payload) {
            void processNFCPayment(payload);
            return;
          }
        }
        toast.error("Unrecognized NFC payment tag");
        setNfcState("idle");
      };

      reader.onerror = () => {
        setNfcState("error");
        toast.error("NFC read error — try again");
      };
      await reader.scan({ signal: controller.signal });
      setNfcState("reading");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setNfcState("error");
      const msg = err instanceof Error ? err.message : "NFC unavailable";
      toast.error(msg.includes("permission") ? "NFC permission denied — check browser settings" : msg);
    }
  };

  function stopNFC() {
    readerRef.current?.controller.abort();
    readerRef.current = null;
    setNfcState("idle");
  }

  const processNFCPayment = async (payload: NFCPayload) => {
    stopNFC();
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !payload.receiverId) throw new Error("This payment tag is missing a NETLIFE CASH recipient.");
      const result = await processPrivateLedgerTransfer({
        senderId: user.id,
        receiverId: payload.receiverId,
        amount: payload.amount,
        transactionType: "transfer",
        description: `NFC payment to ${payload.merchant}`,
      });
      if (!result.success) throw new Error(result.error || "The ledger rejected this payment.");

      setNfcState("success");
      toast.success(`Payment of $${payload.amount} to ${payload.merchant} complete!`);
      loadBalance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
      setNfcState("error");
    } finally {
      setProcessing(false);
    }
  };

  const manualPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    if (!recipientId) { toast.error("Select a NETLIFE CASH recipient"); return; }
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const result = await processPrivateLedgerTransfer({
        senderId: user.id,
        receiverId: recipientId,
        amount: parseFloat(amount),
        transactionType: "transfer",
        description: `Tap payment to ${recipient}`,
      });
      if (!result.success) throw new Error(result.error || "The ledger rejected this payment.");

      toast.success(`Paid $${amount} to ${recipient}!`);
      setAmount("");
      setRecipient("");
      setRecipientId("");
      setSelectedRecipient(null);
      setRecipientResults([]);
      setQrDataUrl("");
      loadBalance();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setProcessing(false);
    }
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
                  {recipientId ? (
                    <div className="mt-1 flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
                      <Avatar className="h-9 w-9">
                        <AvatarImage
                          src={selectedRecipient?.avatar_url || undefined}
                          alt={`${selectedRecipient?.full_name || recipient} profile photo`}
                        />
                        <AvatarFallback>
                          {selectedRecipient ? recipientInitials(selectedRecipient) : "NC"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {selectedRecipient?.full_name || "Unnamed user"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {selectedRecipient?.phone_number || "Phone number unavailable"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => {
                          setRecipientId("");
                          setRecipient("");
                          setSelectedRecipient(null);
                        }}
                        aria-label="Change recipient"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={recipient}
                        onChange={e => handleRecipientChange(e.target.value)}
                        placeholder="Search by name or phone"
                        className="h-9 mt-1"
                      />
                      {recipient.trim().length >= 2 && (
                        <div className="mt-1 overflow-hidden rounded-md border divide-y">
                          {recipientSearching && (
                            <p className="p-2 text-xs text-muted-foreground">Searching…</p>
                          )}
                          {!recipientSearching && recipientResults.length === 0 && (
                            <p className="p-2 text-xs text-muted-foreground">No NETLIFE CASH users found.</p>
                          )}
                          {recipientResults.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
                              onClick={() => {
                                setRecipientId(candidate.id);
                                setRecipient(candidate.full_name || candidate.phone_number || "NETLIFE CASH user");
                                setSelectedRecipient(candidate);
                                setRecipientResults([]);
                              }}
                            >
                              <Avatar className="h-9 w-9">
                                <AvatarImage
                                  src={candidate.avatar_url || undefined}
                                  alt={`${candidate.full_name || "User"} profile photo`}
                                />
                                <AvatarFallback>{recipientInitials(candidate)}</AvatarFallback>
                              </Avatar>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {candidate.full_name || "Unnamed user"}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {candidate.phone_number || "Phone number unavailable"}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <Button onClick={manualPayment} disabled={processing || !recipientId} className="w-full gap-2">
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
                  <Input value={qrMerchantName} onChange={e => setQrMerchantName(e.target.value)}
                    placeholder={userName || "Who is this for?"} className="h-9 mt-1" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    This QR is linked to your signed-in NETLIFE CASH account.
                  </p>
                </div>
                {qrDataUrl && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <img src={qrDataUrl} alt="Payment QR" className="w-48 h-48 rounded-xl border" />
                    <p className="text-xs text-muted-foreground text-center">
                      Show this QR code to the payer. They scan it to send <strong>${amount}</strong> to <strong>{qrMerchantName}</strong>.
                    </p>
                    <Button variant="outline" size="sm" onClick={generateQR} className="gap-1">
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate
                    </Button>
                  </div>
                )}
                {(!qrDataUrl) && (
                  <Button onClick={generateQR} disabled={!amount || !userId || !qrMerchantName.trim()} className="w-full gap-2">
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

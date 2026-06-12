import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Globe, Send, CheckCircle, AlertCircle, Clock, RefreshCw,
} from "lucide-react";

interface Country {
  code: string;
  name: string;
  currency: string;
  symbol: string;
  flag: string;
  rate: number; // GYD per 1 unit of that currency
  limit: number;
  fee_pct: number;
  delivery: string;
}

const COUNTRIES: Country[] = [
  { code: "US", name: "United States",      currency: "USD", symbol: "$",  flag: "🇺🇸", rate: 0.0048, limit: 10000, fee_pct: 1.5, delivery: "1–2 business days" },
  { code: "CA", name: "Canada",             currency: "CAD", symbol: "C$", flag: "🇨🇦", rate: 0.0065, limit: 10000, fee_pct: 1.5, delivery: "1–2 business days" },
  { code: "GB", name: "United Kingdom",     currency: "GBP", symbol: "£",  flag: "🇬🇧", rate: 0.0038, limit: 10000, fee_pct: 2.0, delivery: "1–3 business days" },
  { code: "TT", name: "Trinidad & Tobago",  currency: "TTD", symbol: "TT$",flag: "🇹🇹", rate: 0.033,  limit: 50000, fee_pct: 0.5, delivery: "Same day" },
  { code: "BB", name: "Barbados",           currency: "BBD", symbol: "Bds$",flag: "🇧🇧", rate: 0.0097, limit: 20000, fee_pct: 0.8, delivery: "1 business day" },
  { code: "JM", name: "Jamaica",            currency: "JMD", symbol: "J$", flag: "🇯🇲", rate: 0.74,   limit: 50000, fee_pct: 0.8, delivery: "1 business day" },
  { code: "BR", name: "Brazil",             currency: "BRL", symbol: "R$", flag: "🇧🇷", rate: 0.025,  limit: 15000, fee_pct: 2.0, delivery: "2–3 business days" },
  { code: "CN", name: "China",              currency: "CNY", symbol: "¥",  flag: "🇨🇳", rate: 0.035,  limit: 10000, fee_pct: 2.5, delivery: "2–5 business days" },
  { code: "IN", name: "India",              currency: "INR", symbol: "₹",  flag: "🇮🇳", rate: 0.40,   limit: 25000, fee_pct: 1.8, delivery: "1–2 business days" },
];

const InternationalTransfers = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [destCountry, setDestCountry] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [reference, setReference] = useState("");

  const country = COUNTRIES.find(c => c.code === destCountry);
  const sendAmt = parseFloat(sendAmount) || 0;
  const fee = country ? sendAmt * (country.fee_pct / 100) : 0;
  const totalDeducted = sendAmt + fee;
  const receives = country && sendAmt > 0 ? (sendAmt * country.rate).toFixed(2) : "";

  const submit = async () => {
    if (!country || !sendAmt || !recipientName || !recipientAccount) {
      toast({ variant: "destructive", title: "Fill in all required fields" });
      return;
    }
    if (sendAmt > country.limit) {
      toast({ variant: "destructive", title: `Max transfer to ${country.name} is $${country.limit.toLocaleString()}` });
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ref = `INT-${country.code}-${Date.now().toString(36).toUpperCase()}`;
      await supabase.from("transactions").insert({
        sender_id: user.id,
        receiver_id: user.id,
        amount: totalDeducted,
        fee,
        transaction_type: "international_transfer",
        status: "pending",
        description: `International transfer to ${recipientName} (${country.currency}) — ${country.name}`,
        reference: ref,
      } as never);

      await supabase.rpc("log_audit_event" as never, {
        _action: "international_transfer",
        _entity_type: "transaction",
        _entity_id: user.id,
      } as never);

      setReference(ref);
      setSent(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Transfer failed", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  if (sent && country) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Transfer Initiated!</h2>
          <p className="text-lg mb-1">{country.flag} {receives} {country.currency} to {recipientName}</p>
          <p className="text-muted-foreground text-sm mb-2">{country.delivery}</p>
          <div className="flex items-center justify-center gap-1 text-yellow-600 text-xs mb-4">
            <Clock className="h-3 w-3" />
            <span>Pending compliance review</span>
          </div>
          <p className="text-xs text-muted-foreground mb-6">Ref: {reference}</p>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => { setSent(false); setSendAmount(""); setRecipientName(""); setRecipientAccount(""); setRecipientBank(""); }}>
              New Transfer
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => navigate("/client")}>
              Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5" /> International Transfers
          </h1>
          <p className="text-xs text-primary-foreground/70">Send money abroad securely</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Transfers are subject to AML/compliance review. Large transfers may require additional documentation.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Country</Label>
              <Select value={destCountry} onValueChange={setDestCountry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination country" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>
                      <span className="flex items-center gap-2">
                        <span>{c.flag}</span>
                        <span>{c.name}</span>
                        <span className="text-muted-foreground text-xs">({c.currency})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {country && (
              <div className="bg-muted rounded-lg p-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Rate</p>
                  <p className="font-bold">1 GYD = {country.rate.toFixed(4)} {country.currency}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fee</p>
                  <p className="font-bold">{country.fee_pct}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Delivery</p>
                  <p className="font-bold">{country.delivery}</p>
                </div>
              </div>
            )}

            <div>
              <Label>You Send ($)</Label>
              <Input type="number" placeholder="0.00" value={sendAmount}
                onChange={e => setSendAmount(e.target.value)} />
              {country && sendAmt > 0 && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" />
                  Recipient gets approximately {country.symbol}{receives} {country.currency}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recipient Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input placeholder="Recipient's legal name" value={recipientName}
                onChange={e => setRecipientName(e.target.value)} />
            </div>
            <div>
              <Label>Account / IBAN Number</Label>
              <Input placeholder="Bank account or IBAN" value={recipientAccount}
                onChange={e => setRecipientAccount(e.target.value)} />
            </div>
            <div>
              <Label>Bank Name (optional)</Label>
              <Input placeholder="e.g. Chase Bank" value={recipientBank}
                onChange={e => setRecipientBank(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {sendAmt > 0 && country && (
          <Card>
            <CardContent className="p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>Transfer Amount</span><strong>${sendAmt.toFixed(2)}</strong></div>
              <div className="flex justify-between text-muted-foreground"><span>Transfer Fee ({country.fee_pct}%)</span><span>${fee.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2"><span>Total Deducted</span><span>${totalDeducted.toFixed(2)}</span></div>
              <div className="flex justify-between text-green-600 font-bold">
                <span>Recipient Receives</span>
                <span>{country.symbol}{receives} {country.currency}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Button className="w-full" onClick={submit} disabled={loading || !country || !sendAmt || !recipientName || !recipientAccount}>
          <Send className="h-4 w-4 mr-2" />
          {loading ? "Processing..." : "Send Transfer"}
        </Button>
      </div>
    </div>
  );
};

export default InternationalTransfers;

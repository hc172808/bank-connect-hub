import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { awardPoints } from "@/lib/rewards";
import {
  ArrowLeft, Zap, Wifi, Tv, Droplets, Phone, CreditCard,
  GraduationCap, BookOpen, Building, Landmark, ShieldCheck,
  CarFront, HeartPulse, CheckCircle,
} from "lucide-react";

type BillCategory = "utility" | "school" | "government";

interface BillType {
  icon: React.ElementType;
  label: string;
  color: string;
  category: BillCategory;
  placeholder: string;
}

const billTypes: BillType[] = [
  // Utility
  { icon: Zap,          label: "Electricity",       color: "bg-yellow-500", category: "utility",    placeholder: "Meter / Account number" },
  { icon: Wifi,         label: "Internet",           color: "bg-blue-500",   category: "utility",    placeholder: "Service account number" },
  { icon: Tv,           label: "Cable TV",           color: "bg-purple-500", category: "utility",    placeholder: "Subscriber ID" },
  { icon: Droplets,     label: "Water",              color: "bg-cyan-500",   category: "utility",    placeholder: "Customer account number" },
  { icon: Phone,        label: "Phone / Mobile",     color: "bg-green-500",  category: "utility",    placeholder: "Phone number" },
  { icon: CreditCard,   label: "Other Utility",      color: "bg-gray-500",   category: "utility",    placeholder: "Account number" },
  // School
  { icon: GraduationCap, label: "Tuition Fees",     color: "bg-indigo-500", category: "school",     placeholder: "Student ID / Roll number" },
  { icon: BookOpen,     label: "Exam / Registration", color: "bg-pink-500", category: "school",     placeholder: "Registration number" },
  { icon: Building,     label: "School Boarding",    color: "bg-orange-500", category: "school",     placeholder: "Boarding ID" },
  // Government
  { icon: Landmark,     label: "Property Tax",       color: "bg-teal-500",   category: "government", placeholder: "Property reference number" },
  { icon: ShieldCheck,  label: "Motor Vehicle",      color: "bg-red-500",    category: "government", placeholder: "Licence / Plate number" },
  { icon: CarFront,     label: "Driver's Licence",   color: "bg-amber-600",  category: "government", placeholder: "Licence number" },
  { icon: HeartPulse,   label: "Health / NIS",       color: "bg-rose-500",   category: "government", placeholder: "NIS / Health number" },
  { icon: CreditCard,   label: "Other Gov. Fee",     color: "bg-slate-500",  category: "government", placeholder: "Reference number" },
];

const CATEGORY_LABELS: Record<BillCategory, string> = {
  utility:    "Utilities",
  school:     "School & Education",
  government: "Government & Taxes",
};

const PayBills = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<BillCategory>("utility");
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [paid, setPaid] = useState(false);
  const [reference, setReference] = useState("");

  const visibleBills = billTypes.filter(b => b.category === activeCategory);
  const selectedBillInfo = billTypes.find(b => b.label === selectedBill);

  const handlePayBill = async () => {
    if (!selectedBill || !accountNumber || !amount) {
      toast({ variant: "destructive", title: "Please fill in all fields" });
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ref = `BILL-${selectedBill.toUpperCase().replace(/\s/g, "")}-${Date.now().toString(36).toUpperCase()}`;
      await supabase.from("transactions").insert({
        sender_id: user.id,
        receiver_id: user.id,
        amount: amt,
        transaction_type: "bill_payment",
        status: "completed",
        description: `${selectedBill} payment — ref: ${accountNumber}`,
        reference: ref,
      } as never);

      await supabase.rpc("log_audit_event" as never, {
        _action: "bill_payment",
        _entity_type: "transaction",
        _entity_id: user.id,
      } as never);

      setReference(ref);
      awardPoints(user.id, amt, "bill_payment");
      setPaid(true);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Payment failed", description: err.message });
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
          <p className="text-muted-foreground mb-2">{selectedBill} payment of <strong>${parseFloat(amount).toFixed(2)}</strong> processed.</p>
          <p className="text-xs text-muted-foreground mb-6">Ref: {reference}</p>
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => { setPaid(false); setSelectedBill(null); setAccountNumber(""); setAmount(""); }}>
              Pay Another Bill
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => navigate("/client")}>
              Back to Home
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
          <h1 className="text-xl font-bold">Pay Bills</h1>
          <p className="text-xs text-primary-foreground/70">Utilities · School · Government</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Category tabs */}
        <div className="flex gap-2">
          {(Object.keys(CATEGORY_LABELS) as BillCategory[]).map(cat => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setSelectedBill(null); }}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{CATEGORY_LABELS[activeCategory]}</CardTitle>
            <CardDescription>Select a bill type to pay</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {visibleBills.map((bill) => (
                <button
                  key={bill.label}
                  onClick={() => setSelectedBill(bill.label)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                    selectedBill === bill.label
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className={`w-10 h-10 ${bill.color} rounded-full flex items-center justify-center`}>
                    <bill.icon className="text-white" size={20} />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight">{bill.label}</span>
                </button>
              ))}
            </div>

            {selectedBill && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{selectedBill}</Badge>
                  <Badge variant="outline" className="text-xs capitalize">{activeCategory}</Badge>
                </div>
                <div>
                  <Label>Reference / Account Number</Label>
                  <Input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder={selectedBillInfo?.placeholder || "Account number"}
                  />
                </div>
                <div>
                  <Label>Amount ($)</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {parseFloat(amount) > 0 && (
                  <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span>Bill Amount</span><strong>${parseFloat(amount).toFixed(2)}</strong></div>
                    <div className="flex justify-between text-muted-foreground"><span>Processing Fee</span><span>$0.00</span></div>
                    <div className="flex justify-between border-t pt-1 font-bold"><span>Total</span><span>${parseFloat(amount).toFixed(2)}</span></div>
                  </div>
                )}
                <Button onClick={handlePayBill} className="w-full" disabled={loading}>
                  {loading ? "Processing..." : `Pay ${selectedBill}`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PayBills;

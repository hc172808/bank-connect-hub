import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Landmark, Plus, Calculator, AlertCircle, CheckCircle,
  Clock, DollarSign, Calendar, TrendingDown, FileText,
} from "lucide-react";
import { format, addMonths } from "date-fns";

interface Loan {
  id: string;
  purpose: string;
  loan_type: string;
  principal: number;
  amount_paid: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  start_date: string;
  next_payment_date: string;
  status: "pending" | "active" | "paid" | "overdue" | "rejected";
  created_at: string;
}

const LOAN_TYPES = [
  { value: "personal",   label: "Personal Loan",    rate: 12,  max: 50000,  desc: "For any personal needs" },
  { value: "micro",      label: "Micro Loan",       rate: 18,  max: 5000,   desc: "Quick small loans, fast approval" },
  { value: "business",   label: "Business Loan",    rate: 10,  max: 200000, desc: "Grow your business" },
  { value: "education",  label: "Education Loan",   rate: 7,   max: 100000, desc: "Invest in your future" },
  { value: "emergency",  label: "Emergency Loan",   rate: 15,  max: 10000,  desc: "Same-day disbursement" },
];

const STORAGE_KEY = "vbank_loans_v1";

function calcMonthlyPayment(principal: number, annualRate: number, months: number) {
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

const statusColor: Record<string, string> = {
  pending:  "bg-yellow-100 text-yellow-700",
  active:   "bg-green-100 text-green-700",
  paid:     "bg-blue-100 text-blue-700",
  overdue:  "bg-red-100 text-red-700",
  rejected: "bg-gray-100 text-gray-600",
};

const statusIcon: Record<string, React.ReactNode> = {
  pending:  <Clock className="h-3 w-3" />,
  active:   <CheckCircle className="h-3 w-3" />,
  paid:     <CheckCircle className="h-3 w-3" />,
  overdue:  <AlertCircle className="h-3 w-3" />,
  rejected: <AlertCircle className="h-3 w-3" />,
};

const Loans = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [userId, setUserId] = useState("");
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");

  const [form, setForm] = useState({
    purpose: "",
    loan_type: "personal",
    amount: "",
    term_months: "12",
  });

  const selectedType = LOAN_TYPES.find(t => t.value === form.loan_type)!;
  const loanAmount = parseFloat(form.amount) || 0;
  const termMonths = parseInt(form.term_months) || 12;
  const previewMonthly = loanAmount > 0 ? calcMonthlyPayment(loanAmount, selectedType.rate, termMonths) : 0;
  const totalRepay = previewMonthly * termMonths;
  const totalInterest = totalRepay - loanAmount;

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) setLoans(JSON.parse(raw));
  };

  const save = (list: Loan[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setLoans(list);
  };

  const applyLoan = () => {
    if (!form.purpose.trim() || !form.amount) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    if (loanAmount > selectedType.max) {
      toast({ title: `Max for ${selectedType.label} is $${selectedType.max.toLocaleString()}`, variant: "destructive" });
      return;
    }
    const monthly = calcMonthlyPayment(loanAmount, selectedType.rate, termMonths);
    const newLoan: Loan = {
      id: `loan-${Date.now()}`,
      purpose: form.purpose,
      loan_type: form.loan_type,
      principal: loanAmount,
      amount_paid: 0,
      interest_rate: selectedType.rate,
      term_months: termMonths,
      monthly_payment: monthly,
      start_date: new Date().toISOString(),
      next_payment_date: addMonths(new Date(), 1).toISOString(),
      status: "pending",
      created_at: new Date().toISOString(),
    };
    save([newLoan, ...loans]);
    setOpen(false);
    setForm({ purpose: "", loan_type: "personal", amount: "", term_months: "12" });
    toast({ title: "Loan application submitted!", description: "Under review — typically 1-2 business days." });
  };

  const makePayment = (id: string) => {
    const amt = parseFloat(payAmt);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    const updated = loans.map(l => {
      if (l.id !== id) return l;
      const newPaid = l.amount_paid + amt;
      const totalOwed = l.monthly_payment * l.term_months;
      const status: Loan["status"] = newPaid >= totalOwed ? "paid" : "active";
      return {
        ...l,
        amount_paid: newPaid,
        status,
        next_payment_date: addMonths(new Date(), 1).toISOString(),
      };
    });
    save(updated);
    setPayOpen(null);
    setPayAmt("");
    toast({ title: "Payment recorded" });
  };

  const totalOwed = loans
    .filter(l => l.status === "active" || l.status === "overdue")
    .reduce((s, l) => s + (l.monthly_payment * l.term_months - l.amount_paid), 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Landmark className="h-5 w-5" /> Loans
            </h1>
            <p className="text-xs text-primary-foreground/70">Apply & manage loans</p>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary"><Plus className="h-4 w-4 mr-1" /> Apply</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Apply for a Loan</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Loan Type</Label>
                <Select value={form.loan_type}
                  onValueChange={v => setForm({ ...form, loan_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOAN_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        <div>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.rate}% p.a. · max ${t.max.toLocaleString()}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Purpose</Label>
                <Input placeholder="e.g. Home renovation" value={form.purpose}
                  onChange={e => setForm({ ...form, purpose: e.target.value })} />
              </div>
              <div>
                <Label>Loan Amount ($)</Label>
                <Input type="number" placeholder="0.00" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Max: ${selectedType.max.toLocaleString()}</p>
              </div>
              <div>
                <Label>Repayment Term</Label>
                <Select value={form.term_months}
                  onValueChange={v => setForm({ ...form, term_months: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3, 6, 12, 18, 24, 36, 48, 60].map(m => (
                      <SelectItem key={m} value={String(m)}>{m} months</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {loanAmount > 0 && (
                <Card className="bg-muted">
                  <CardContent className="p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span>Monthly Payment</span><strong>${previewMonthly.toFixed(2)}</strong></div>
                    <div className="flex justify-between"><span>Total Repayable</span><strong>${totalRepay.toFixed(2)}</strong></div>
                    <div className="flex justify-between text-muted-foreground"><span>Total Interest</span><span>${totalInterest.toFixed(2)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>Rate</span><span>{selectedType.rate}% p.a.</span></div>
                  </CardContent>
                </Card>
              )}
              <Button className="w-full" onClick={applyLoan}>Submit Application</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="p-4 space-y-4">
        {/* Summary */}
        {totalOwed > 0 && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-red-600 font-medium">Total Outstanding</p>
                <p className="text-2xl font-bold text-red-700">${totalOwed.toFixed(2)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-400" />
            </CardContent>
          </Card>
        )}

        {/* Loan types info */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700">
                <strong>Quick approval:</strong> Micro loans (up to $5k) approved same day. Personal and business loans typically 1–2 business days.
              </div>
            </div>
          </CardContent>
        </Card>

        {loans.length === 0 ? (
          <div className="text-center py-16">
            <Landmark className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No active loans</p>
            <p className="text-sm text-muted-foreground">Apply for a loan to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {loans.map(loan => {
              const totalOwedLoan = loan.monthly_payment * loan.term_months;
              const pct = Math.min((loan.amount_paid / totalOwedLoan) * 100, 100);
              const remaining = Math.max(totalOwedLoan - loan.amount_paid, 0);
              return (
                <Card key={loan.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{loan.purpose}</CardTitle>
                      <Badge className={statusColor[loan.status]}>
                        <span className="flex items-center gap-1">
                          {statusIcon[loan.status]} {loan.status}
                        </span>
                      </Badge>
                    </div>
                    <CardDescription>{LOAN_TYPES.find(t => t.value === loan.loan_type)?.label} · {loan.interest_rate}% p.a.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-muted-foreground">Principal</p>
                        <p className="font-bold">${loan.principal.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Monthly</p>
                        <p className="font-bold">${loan.monthly_payment.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining</p>
                        <p className="font-bold text-red-600">${remaining.toFixed(2)}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Repayment progress</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Next payment: {format(new Date(loan.next_payment_date), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {loan.term_months} months
                      </div>
                    </div>
                    {loan.status === "active" && (
                      <Dialog open={payOpen === loan.id} onOpenChange={o => { setPayOpen(o ? loan.id : null); setPayAmt(""); }}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="w-full"><DollarSign className="h-4 w-4 mr-1" /> Make Payment</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Loan Payment</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">Monthly payment due: <strong>${loan.monthly_payment.toFixed(2)}</strong></p>
                            <div>
                              <Label>Payment Amount ($)</Label>
                              <Input type="number" placeholder={loan.monthly_payment.toFixed(2)} value={payAmt}
                                onChange={e => setPayAmt(e.target.value)} autoFocus />
                            </div>
                            <Button className="w-full" onClick={() => makePayment(loan.id)}>Confirm Payment</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    )}
                    {loan.status === "pending" && (
                      <p className="text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                        Application under review. You will be notified once approved.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Loans;

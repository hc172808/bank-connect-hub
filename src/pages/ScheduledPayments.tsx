import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarClock, Plus, Trash2, Clock, CheckCircle2, XCircle, RepeatIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, isPast } from "date-fns";

interface ScheduledPayment {
  id: string;
  recipient: string;
  amount: string;
  currency: string;
  description: string;
  date: string;
  frequency: "once" | "daily" | "weekly" | "monthly";
  status: "pending" | "completed" | "cancelled";
  createdAt: string;
}

const STORAGE_KEY = (uid: string) => `vbank_scheduled_payments_v1_${uid}`;
const FREQUENCIES = ["once", "daily", "weekly", "monthly"] as const;

const ScheduledPayments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    recipient: "",
    amount: "",
    currency: "USD",
    description: "",
    date: "",
    frequency: "once" as ScheduledPayment["frequency"],
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUserId(data.user.id);
        const stored = localStorage.getItem(STORAGE_KEY(data.user.id));
        if (stored) setPayments(JSON.parse(stored));
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const save = (updated: ScheduledPayment[]) => {
    setPayments(updated);
    localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(updated));
  };

  const addPayment = () => {
    if (!form.recipient || !form.amount || !form.date) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    const payment: ScheduledPayment = {
      id: crypto.randomUUID(),
      ...form,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    save([payment, ...payments]);
    setForm({ recipient: "", amount: "", currency: "USD", description: "", date: "", frequency: "once" });
    setShowForm(false);
    toast({ title: "Payment scheduled", description: `${form.amount} ${form.currency} to ${form.recipient}` });
  };

  const cancel = (id: string) => {
    save(payments.map(p => p.id === id ? { ...p, status: "cancelled" } : p));
    toast({ title: "Payment cancelled" });
  };

  const remove = (id: string) => {
    save(payments.filter(p => p.id !== id));
  };

  const statusBadge = (p: ScheduledPayment) => {
    if (p.status === "cancelled") return <Badge variant="destructive">Cancelled</Badge>;
    if (p.status === "completed") return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Completed</Badge>;
    if (isPast(parseISO(p.date)) && p.frequency === "once") return <Badge variant="secondary">Overdue</Badge>;
    return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">Scheduled</Badge>;
  };

  const pending = payments.filter(p => p.status === "pending");
  const past    = payments.filter(p => p.status !== "pending");

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Scheduled Payments</h1>
          <p className="text-xs text-muted-foreground">Set up one-time and recurring payments</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1">
          <Plus size={16} /> New
        </Button>
      </div>

      <div className="p-4 space-y-5 max-w-xl mx-auto">

        {/* New payment form */}
        {showForm && (
          <Card className="border-primary/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">New Scheduled Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Recipient Phone / ID <span className="text-destructive">*</span></Label>
                <Input placeholder="+592 xxx xxxx" value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount <span className="text-destructive">*</span></Label>
                  <Input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.currency}
                    onChange={e => setForm({ ...form, currency: e.target.value })}
                  >
                    {["USD", "GYD", "EUR", "GBP"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input placeholder="e.g. Rent, Allowance" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} min={new Date().toISOString().split("T")[0]} />
                </div>
                <div>
                  <Label>Repeat</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
                    value={form.frequency}
                    onChange={e => setForm({ ...form, frequency: e.target.value as ScheduledPayment["frequency"] })}
                  >
                    {FREQUENCIES.map(f => <option key={f} value={f} className="capitalize">{f === "once" ? "One time" : `Every ${f.replace("ly","")}`}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={addPayment} className="flex-1">Schedule Payment</Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                ℹ️ Payments are scheduled locally. Actual execution requires the auto-payment service enabled on your account.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pending/upcoming */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Clock size={15} /> UPCOMING ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                <CalendarClock size={32} className="mx-auto mb-2 opacity-30" />
                No upcoming payments. Tap <strong>New</strong> to schedule one.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map(p => (
                <Card key={p.id}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {statusBadge(p)}
                          {p.frequency !== "once" && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <RepeatIcon size={10} /> {p.frequency}
                            </Badge>
                          )}
                        </div>
                        <p className="font-semibold">{p.amount} {p.currency} → {p.recipient}</p>
                        {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.frequency === "once" ? "On" : "Starting"} {format(parseISO(p.date), "d MMM yyyy")}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => cancel(p.id)} className="text-destructive hover:text-destructive shrink-0">
                        <XCircle size={18} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Past payments */}
        {past.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 size={15} /> HISTORY ({past.length})
            </h2>
            <div className="space-y-2">
              {past.map(p => (
                <Card key={p.id} className="opacity-60">
                  <CardContent className="pt-3 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">{statusBadge(p)}</div>
                        <p className="text-sm">{p.amount} {p.currency} → {p.recipient}</p>
                        <p className="text-xs text-muted-foreground">{format(parseISO(p.date), "d MMM yyyy")}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)} className="text-muted-foreground shrink-0">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScheduledPayments;

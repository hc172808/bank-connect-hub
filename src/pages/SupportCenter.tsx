import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, HeadphonesIcon, Plus, MessageSquare, Clock,
  CheckCircle, AlertTriangle, ChevronRight, Search, BookOpen,
  Phone, Mail, HelpCircle,
} from "lucide-react";
import { format } from "date-fns";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "resolved" | "closed";
  message: string;
  created_at: string;
  updated_at: string;
  reference: string;
}

interface FAQ {
  q: string;
  a: string;
  category: string;
}

const FAQS: FAQ[] = [
  { q: "How do I send money?",                    a: "Go to your dashboard and tap 'Send Money'. Enter the recipient's phone number or name, enter the amount, and confirm with your PIN.", category: "transfers" },
  { q: "Why was my transaction declined?",        a: "Transactions can be declined due to insufficient balance, spending limits, or security flags. Check your balance and limits in Settings.", category: "transfers" },
  { q: "How do I complete KYC verification?",     a: "Go to Menu → Profile → KYC Verification. Upload a valid ID and a selfie. Approval takes 1–3 business days.", category: "kyc" },
  { q: "How do I reset my PIN?",                  a: "Go to Menu → Security Settings → Change PIN. You'll need to verify your identity via OTP first.", category: "security" },
  { q: "What are the transfer fees?",             a: "Domestic transfers: 0.5% (min $0.50). International: varies by country (0.5–2.5%). View the full fee schedule in Settings → Fees.", category: "fees" },
  { q: "How do I deposit funds?",                 a: "Go to Dashboard → Deposit. You can deposit via bank transfer, agent cash deposit, or QR code payment.", category: "deposits" },
  { q: "My account is locked. What do I do?",     a: "Contact our support team via this Support Center or call +592-XXX-XXXX. We'll verify your identity and restore access.", category: "account" },
  { q: "How do I enable 2FA?",                    a: "Go to Menu → Security Settings → Two-Factor Authentication. You can use an authenticator app or SMS OTP.", category: "security" },
  { q: "Can I use the app internationally?",      a: "Yes! You can send international transfers to 9+ countries. Go to Financial Tools → International Transfers.", category: "international" },
];

const CATEGORIES = ["All", "transfers", "kyc", "security", "fees", "deposits", "account", "international"];

const STORAGE_KEY = "vbank_support_v1";

const PRIORITY_COLORS: Record<string, string> = {
  low: "outline", medium: "secondary", high: "destructive", urgent: "destructive",
};
const STATUS_COLORS: Record<string, string> = {
  open: "secondary", in_progress: "secondary", resolved: "default", closed: "outline",
};

const SupportCenter = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTab, setActiveTab] = useState<"faq" | "tickets" | "contact">("faq");
  const [faqFilter, setFaqFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "transfers", priority: "medium" as Ticket["priority"], message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) setTickets(JSON.parse(raw));
  };

  const saveTickets = (t: Ticket[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(t));
    setTickets(t);
  };

  const submitTicket = async () => {
    if (!form.subject || !form.message) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const ref = `TKT-${Date.now().toString().slice(-8)}`;
      const newTicket: Ticket = {
        id: `ticket-${Date.now()}`, subject: form.subject, category: form.category,
        priority: form.priority, status: "open", message: form.message,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(), reference: ref,
      };
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "🎫 Support Ticket Received",
        message: `Ticket ${ref}: "${form.subject}" is open. We'll respond within 24 hours.`,
        type: "support_ticket",
      } as never);
      saveTickets([newTicket, ...tickets]);
      setCreateOpen(false);
      setForm({ subject: "", category: "transfers", priority: "medium", message: "" });
      toast({ title: "Ticket Submitted!", description: `Reference: ${ref}. We'll respond within 24 hours.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredFAQs = FAQS.filter(faq =>
    (faqFilter === "All" || faq.category === faqFilter) &&
    (search === "" || faq.q.toLowerCase().includes(search.toLowerCase()) || faq.a.toLowerCase().includes(search.toLowerCase()))
  );

  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><HeadphonesIcon className="h-5 w-5" /> Support Center</h1>
            <p className="text-xs text-primary-foreground/70">FAQ · Tickets · Contact</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary"><Plus className="h-4 w-4 mr-1" /> New Ticket</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Submit Support Ticket</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Subject *</Label><Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief description of your issue" /></div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c !== "All").map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v as Ticket["priority"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["low", "medium", "high", "urgent"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Message *</Label>
                  <textarea className="w-full border rounded-md p-3 text-sm min-h-[100px] bg-background"
                    value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                    placeholder="Describe your issue in detail..." />
                </div>
                <Button className="w-full" onClick={submitTicket} disabled={submitting}>{submitting ? "Submitting..." : "Submit Ticket"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          {(["faq", "tickets", "contact"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab === "tickets" ? `Tickets (${tickets.length})` : tab.toUpperCase() === "FAQ" ? "FAQ" : tab}
            </button>
          ))}
        </div>

        {activeTab === "faq" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search FAQs..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {CATEGORIES.map(cat => (
                <button key={cat}
                  onClick={() => setFaqFilter(cat)}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${faqFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {cat}
                </button>
              ))}
            </div>
            {filteredFAQs.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">No FAQs found</p>
            ) : (
              filteredFAQs.map((faq, i) => (
                <Card key={i} className="cursor-pointer" onClick={() => setExpandedFAQ(expandedFAQ === faq.q ? null : faq.q)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium text-sm">{faq.q}</p>
                        {expandedFAQ === faq.q && (
                          <p className="text-sm text-muted-foreground mt-2">{faq.a}</p>
                        )}
                      </div>
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedFAQ === faq.q ? "rotate-90" : ""}`} />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "tickets" && (
          <div className="space-y-3">
            {tickets.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>No support tickets</p>
                <Button className="mt-4" onClick={() => setCreateOpen(true)}>Create Your First Ticket</Button>
              </div>
            ) : (
              tickets.map(ticket => (
                <Card key={ticket.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">{ticket.reference} · {format(new Date(ticket.created_at), "MMM d, yyyy")}</p>
                      </div>
                      <div className="flex gap-1">
                        <Badge variant={PRIORITY_COLORS[ticket.priority] as any} className="text-xs capitalize">{ticket.priority}</Badge>
                        <Badge variant={STATUS_COLORS[ticket.status] as any} className="text-xs capitalize">{ticket.status.replace("_", " ")}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground bg-muted rounded p-2">{ticket.message.slice(0, 100)}{ticket.message.length > 100 ? "..." : ""}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "contact" && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="font-semibold">Contact NETLIFE CASH Support</p>
                {[
                  { icon: Phone, label: "Phone Support", value: "+592-XXX-XXXX", sub: "Mon–Fri 8am–6pm" },
                  { icon: Mail, label: "Email Support", value: "support@netlifecash.com", sub: "Response within 24 hours" },
                  { icon: MessageSquare, label: "Live Chat", value: "Available in-app", sub: "Mon–Fri 9am–5pm" },
                ].map(contact => (
                  <div key={contact.label} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <contact.icon className="h-5 w-5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{contact.label}</p>
                      <p className="text-sm text-primary">{contact.value}</p>
                      <p className="text-xs text-muted-foreground">{contact.sub}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-yellow-200 bg-yellow-50">
              <CardContent className="p-4">
                <p className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" /> Emergency — Account Compromised?
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">If you believe your account has been compromised, immediately lock your account.</p>
                <Button variant="destructive" className="w-full" onClick={() => navigate("/security")}>
                  Go to Security Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportCenter;

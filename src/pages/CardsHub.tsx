import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, CreditCard, CheckCircle, Clock, Building2,
  Smartphone, Shield, Star, ArrowRight, Zap,
} from "lucide-react";

interface CardProduct {
  id: string;
  name: string;
  type: string;
  description: string;
  features: string[];
  limit?: string;
  annual_fee: number;
  color: string;
  gradient: string;
  status: "available" | "coming_soon" | "invite_only";
  icon: React.ElementType;
}

const CARD_PRODUCTS: CardProduct[] = [
  {
    id: "virtual",
    name: "NETLIFE Virtual Card",
    type: "Virtual",
    description: "Instant digital card for online and in-app payments",
    features: ["Instant issuance", "Online payments", "Freeze/unfreeze", "Spending limits", "3 cards max"],
    annual_fee: 0,
    color: "text-blue-600",
    gradient: "from-blue-600 to-blue-800",
    status: "available",
    icon: Smartphone,
  },
  {
    id: "debit",
    name: "NETLIFE Debit Card",
    type: "Debit",
    description: "Physical card linked directly to your wallet",
    features: ["ATM withdrawals", "POS payments", "Contactless", "Mobile wallet support", "Worldwide acceptance"],
    limit: "$5,000/day",
    annual_fee: 10,
    color: "text-green-600",
    gradient: "from-green-600 to-teal-700",
    status: "available",
    icon: CreditCard,
  },
  {
    id: "prepaid",
    name: "NETLIFE Prepaid",
    type: "Prepaid",
    description: "Load and spend — perfect for budgeting and gifts",
    features: ["No credit check", "Load any amount", "Gift card option", "Online & POS", "Reloadable"],
    limit: "$2,000 balance",
    annual_fee: 5,
    color: "text-purple-600",
    gradient: "from-purple-600 to-indigo-700",
    status: "available",
    icon: CreditCard,
  },
  {
    id: "business",
    name: "NETLIFE Business",
    type: "Business",
    description: "Corporate card for business expenses and team spending",
    features: ["Team cards", "Expense tracking", "Higher limits", "Business rewards", "Receipt capture"],
    limit: "$50,000/month",
    annual_fee: 50,
    color: "text-slate-700",
    gradient: "from-slate-700 to-slate-900",
    status: "available",
    icon: Building2,
  },
  {
    id: "credit",
    name: "NETLIFE Credit",
    type: "Credit",
    description: "Build credit with a secured credit card",
    features: ["Credit building", "2% cashback", "Zero liability", "Flexible payments", "Free FICO score"],
    limit: "$10,000",
    annual_fee: 25,
    color: "text-yellow-600",
    gradient: "from-yellow-500 to-orange-600",
    status: "coming_soon",
    icon: Star,
  },
  {
    id: "platinum",
    name: "NETLIFE Platinum",
    type: "Premium",
    description: "Premium card with exclusive benefits and perks",
    features: ["3% cashback", "Airport lounge", "Travel insurance", "Concierge service", "No FX fees"],
    limit: "No pre-set limit",
    annual_fee: 200,
    color: "text-violet-600",
    gradient: "from-violet-600 to-purple-800",
    status: "invite_only",
    icon: Zap,
  },
];

const CardsHub = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [selected, setSelected] = useState<CardProduct | null>(null);
  const [form, setForm] = useState({ full_name: "", dob: "", address: "", income: "" });
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);

  const apply = async () => {
    if (!form.full_name || !form.dob) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: `📋 Card Application Received`,
        message: `Your ${selected?.name} application is under review. You'll hear back within 3–5 business days.`,
        type: "card_application",
      } as never);
      await supabase.rpc("log_audit_event" as never, { _action: "card_application", _entity_type: "card", _entity_id: user.id } as never);
      setApplied([...applied, selected!.id]);
      setApplyOpen(false);
      toast({ title: "Application Submitted!", description: "We'll review your application within 3–5 business days." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><CreditCard className="h-5 w-5" /> Cards</h1>
            <p className="text-xs text-white/70">Virtual · Debit · Prepaid · Business</p>
          </div>
        </div>
        <Button variant="ghost" className="text-white text-sm gap-2" onClick={() => navigate("/virtual-cards")}>
          <Smartphone className="h-4 w-4" /> Manage Virtual Cards <ArrowRight className="h-4 w-4" />
        </Button>
      </header>

      <div className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">Choose the right card for your needs</p>

        {CARD_PRODUCTS.map(card => {
          const isApplied = applied.includes(card.id);
          return (
            <Card key={card.id}>
              <CardContent className="p-4">
                {/* Card visual preview */}
                <div className={`h-28 rounded-2xl bg-gradient-to-br ${card.gradient} p-4 mb-4 flex items-end`}>
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <p className="text-white/70 text-xs uppercase tracking-wider">{card.type}</p>
                      <p className="text-white font-bold text-lg">{card.name.replace("NETLIFE ", "")}</p>
                    </div>
                    <card.icon className="h-8 w-8 text-white/80" />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3">{card.description}</p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {card.features.map(f => (
                    <span key={f} className="text-xs bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="h-2.5 w-2.5 text-green-500" />{f}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div>
                    {card.limit && <p className="text-xs text-muted-foreground">Limit: <strong>{card.limit}</strong></p>}
                    <p className="text-xs text-muted-foreground">Annual fee: <strong>${card.annual_fee === 0 ? "Free" : `$${card.annual_fee}`}</strong></p>
                  </div>
                  <Badge variant={
                    card.status === "available" ? "default" :
                    card.status === "coming_soon" ? "secondary" : "outline"
                  } className="text-xs capitalize">
                    {card.status === "coming_soon" ? "Coming Soon" : card.status === "invite_only" ? "Invite Only" : "Available"}
                  </Badge>
                </div>

                {card.id === "virtual" ? (
                  <Button className="w-full" onClick={() => navigate("/virtual-cards")}>
                    <Smartphone className="h-4 w-4 mr-2" /> Manage Virtual Cards
                  </Button>
                ) : card.status === "available" ? (
                  <Dialog open={applyOpen && selected?.id === card.id} onOpenChange={open => { setApplyOpen(open); if (open) setSelected(card); }}>
                    <DialogTrigger asChild>
                      <Button className="w-full" disabled={isApplied} onClick={() => setSelected(card)}>
                        {isApplied ? <><CheckCircle className="h-4 w-4 mr-2" /> Applied</> : <>Apply Now</>}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Apply for {selected?.name}</DialogTitle></DialogHeader>
                      <div className="space-y-4">
                        <div><Label>Full Legal Name *</Label><Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
                        <div><Label>Date of Birth *</Label><Input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} /></div>
                        <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Delivery address" /></div>
                        <div><Label>Monthly Income ($)</Label><Input type="number" value={form.income} onChange={e => setForm({ ...form, income: e.target.value })} /></div>
                        <Button className="w-full" onClick={apply} disabled={submitting}>{submitting ? "Submitting..." : "Submit Application"}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    {card.status === "coming_soon" ? <><Clock className="h-4 w-4 mr-2" /> Coming Soon</> : <><Shield className="h-4 w-4 mr-2" /> Invite Only</>}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default CardsHub;

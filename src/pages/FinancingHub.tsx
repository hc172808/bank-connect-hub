import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Home, Car, ShoppingCart, Calculator, CheckCircle,
  Clock, AlertCircle, DollarSign,
} from "lucide-react";

type ProductType = "mortgage" | "vehicle" | "bnpl";

interface FinancingProduct {
  id: ProductType;
  name: string;
  icon: React.ElementType;
  description: string;
  color: string;
  gradient: string;
  rate_from: number;
  term_range: string;
  max_amount: number;
  features: string[];
}

const PRODUCTS: FinancingProduct[] = [
  {
    id: "mortgage",
    name: "Mortgage",
    icon: Home,
    description: "Finance your home purchase or refinance your existing mortgage",
    color: "text-blue-600",
    gradient: "from-blue-500 to-blue-700",
    rate_from: 5.5,
    term_range: "10–30 years",
    max_amount: 1000000,
    features: ["Fixed & variable rates", "First-time buyer programs", "Refinancing options", "Fast pre-approval"],
  },
  {
    id: "vehicle",
    name: "Vehicle Financing",
    icon: Car,
    description: "New or used vehicle financing with competitive rates",
    color: "text-green-600",
    gradient: "from-green-500 to-teal-700",
    rate_from: 4.9,
    term_range: "12–72 months",
    max_amount: 100000,
    features: ["New & used vehicles", "Motorcycles & boats", "Flexible down payment", "Online approval"],
  },
  {
    id: "bnpl",
    name: "Buy Now, Pay Later",
    icon: ShoppingCart,
    description: "Split any purchase into easy installments — no interest if paid on time",
    color: "text-purple-600",
    gradient: "from-purple-500 to-indigo-700",
    rate_from: 0,
    term_range: "4–24 weeks",
    max_amount: 5000,
    features: ["Split into 4 payments", "No interest (on time)", "Instant approval", "Works everywhere"],
  },
];

function calcMonthlyPayment(principal: number, annualRate: number, months: number): number {
  if (annualRate === 0) return principal / months;
  const r = annualRate / 100 / 12;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

const FinancingHub = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [applyOpen, setApplyOpen] = useState(false);
  const [selected, setSelected] = useState<FinancingProduct | null>(null);
  const [applied, setApplied] = useState<ProductType[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Mortgage form
  const [mortgageForm, setMortgageForm] = useState({ property_value: "", down_payment: "", term: "25", income: "" });
  // Vehicle form
  const [vehicleForm, setVehicleForm] = useState({ vehicle_price: "", down_payment: "", term: "60", vehicle_type: "car", make: "" });
  // BNPL form
  const [bnplForm, setBnplForm] = useState({ amount: "", merchant: "", installments: "4" });

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: `📋 ${selected?.name} Application`,
        message: `Your ${selected?.name} application has been submitted. Expect a decision within 2–5 business days.`,
        type: "financing_application",
      } as never);
      await supabase.rpc("log_audit_event" as never, { _action: "financing_application", _entity_type: "loan", _entity_id: user.id } as never);
      setApplied([...applied, selected!.id]);
      setApplyOpen(false);
      toast({ title: "Application Submitted!", description: "We'll review within 2–5 business days." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Failed", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Calculator for active selection
  const calcMortgage = () => {
    const val = parseFloat(mortgageForm.property_value) || 0;
    const dp = parseFloat(mortgageForm.down_payment) || 0;
    const principal = val - dp;
    const months = parseInt(mortgageForm.term) * 12;
    return { principal, monthly: calcMonthlyPayment(principal, selected?.rate_from || 5.5, months) };
  };

  const calcVehicle = () => {
    const price = parseFloat(vehicleForm.vehicle_price) || 0;
    const dp = parseFloat(vehicleForm.down_payment) || 0;
    const principal = price - dp;
    const months = parseInt(vehicleForm.term);
    return { principal, monthly: calcMonthlyPayment(principal, selected?.rate_from || 4.9, months) };
  };

  const calcBNPL = () => {
    const amt = parseFloat(bnplForm.amount) || 0;
    const installments = parseInt(bnplForm.installments) || 4;
    return { installment: amt / installments };
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Financing</h1>
            <p className="text-xs text-white/70">Mortgage · Vehicle · Buy Now Pay Later</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">Subject to credit approval. Rates shown are indicative. Full terms will be provided upon application review.</p>
          </CardContent>
        </Card>

        {PRODUCTS.map(product => {
          const isApplied = applied.includes(product.id);
          return (
            <Card key={product.id}>
              <CardContent className="p-4">
                <div className={`h-24 rounded-2xl bg-gradient-to-br ${product.gradient} p-4 mb-4 flex items-center gap-4`}>
                  <product.icon className="h-10 w-10 text-white/90" />
                  <div>
                    <p className="text-white font-bold text-xl">{product.name}</p>
                    <p className="text-white/70 text-sm">From {product.rate_from}% · {product.term_range}</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3">{product.description}</p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {product.features.map(f => (
                    <span key={f} className="text-xs bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle className="h-2.5 w-2.5 text-green-500" />{f}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm mb-3 bg-muted rounded-lg p-2">
                  <span>Up to ${product.max_amount.toLocaleString()}</span>
                  <Badge variant="outline">{product.term_range}</Badge>
                </div>

                <Dialog open={applyOpen && selected?.id === product.id} onOpenChange={open => { setApplyOpen(open); if (open) setSelected(product); }}>
                  <DialogTrigger asChild>
                    <Button className="w-full" disabled={isApplied} onClick={() => setSelected(product)}>
                      {isApplied ? <><CheckCircle className="h-4 w-4 mr-2" /> Applied</> : "Apply & Calculate"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>{selected?.name} Application</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      {selected?.id === "mortgage" && (
                        <>
                          <div><Label>Property Value ($) *</Label><Input type="number" value={mortgageForm.property_value} onChange={e => setMortgageForm({ ...mortgageForm, property_value: e.target.value })} /></div>
                          <div><Label>Down Payment ($)</Label><Input type="number" value={mortgageForm.down_payment} onChange={e => setMortgageForm({ ...mortgageForm, down_payment: e.target.value })} /></div>
                          <div>
                            <Label>Term</Label>
                            <Select value={mortgageForm.term} onValueChange={v => setMortgageForm({ ...mortgageForm, term: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["10", "15", "20", "25", "30"].map(t => <SelectItem key={t} value={t}>{t} years</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div><Label>Monthly Income ($)</Label><Input type="number" value={mortgageForm.income} onChange={e => setMortgageForm({ ...mortgageForm, income: e.target.value })} /></div>
                          {mortgageForm.property_value && (
                            <Card className="border-blue-200 bg-blue-50">
                              <CardContent className="p-3 space-y-1 text-sm">
                                <div className="flex justify-between"><span>Loan Amount</span><strong>${calcMortgage().principal.toFixed(2)}</strong></div>
                                <div className="flex justify-between"><span>Est. Monthly</span><strong className="text-blue-700">${calcMortgage().monthly.toFixed(2)}</strong></div>
                                <div className="flex justify-between text-muted-foreground"><span>Rate from</span><span>{selected.rate_from}% p.a.</span></div>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}
                      {selected?.id === "vehicle" && (
                        <>
                          <div><Label>Vehicle Price ($) *</Label><Input type="number" value={vehicleForm.vehicle_price} onChange={e => setVehicleForm({ ...vehicleForm, vehicle_price: e.target.value })} /></div>
                          <div><Label>Down Payment ($)</Label><Input type="number" value={vehicleForm.down_payment} onChange={e => setVehicleForm({ ...vehicleForm, down_payment: e.target.value })} /></div>
                          <div>
                            <Label>Vehicle Type</Label>
                            <Select value={vehicleForm.vehicle_type} onValueChange={v => setVehicleForm({ ...vehicleForm, vehicle_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["car", "motorcycle", "truck", "boat"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Term (months)</Label>
                            <Select value={vehicleForm.term} onValueChange={v => setVehicleForm({ ...vehicleForm, term: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["12","24","36","48","60","72"].map(t => <SelectItem key={t} value={t}>{t} months</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          {vehicleForm.vehicle_price && (
                            <Card className="border-green-200 bg-green-50">
                              <CardContent className="p-3 space-y-1 text-sm">
                                <div className="flex justify-between"><span>Loan Amount</span><strong>${calcVehicle().principal.toFixed(2)}</strong></div>
                                <div className="flex justify-between"><span>Monthly Payment</span><strong className="text-green-700">${calcVehicle().monthly.toFixed(2)}</strong></div>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}
                      {selected?.id === "bnpl" && (
                        <>
                          <div><Label>Purchase Amount ($) *</Label><Input type="number" value={bnplForm.amount} onChange={e => setBnplForm({ ...bnplForm, amount: e.target.value })} /></div>
                          <div><Label>Merchant / Store</Label><Input value={bnplForm.merchant} onChange={e => setBnplForm({ ...bnplForm, merchant: e.target.value })} /></div>
                          <div>
                            <Label>Installments</Label>
                            <Select value={bnplForm.installments} onValueChange={v => setBnplForm({ ...bnplForm, installments: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["4","8","12","24"].map(n => <SelectItem key={n} value={n}>{n} installments</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          {bnplForm.amount && (
                            <Card className="border-purple-200 bg-purple-50">
                              <CardContent className="p-3 text-center">
                                <p className="text-3xl font-bold text-purple-700">${calcBNPL().installment.toFixed(2)}</p>
                                <p className="text-sm text-muted-foreground">per installment × {bnplForm.installments}</p>
                                <p className="text-xs text-green-600 mt-1">0% interest if paid on schedule</p>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}
                      <Button className="w-full" onClick={submit} disabled={submitting}>{submitting ? "Submitting..." : "Submit Application"}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default FinancingHub;

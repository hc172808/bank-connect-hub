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
  ArrowLeft, FileText, Link, RefreshCw, Plus, Copy, CheckCircle,
  Clock, Send, Tag, Calendar, DollarSign, Trash2, Download,
} from "lucide-react";
import { format, addDays } from "date-fns";

interface InvoiceItem {
  description: string;
  quantity: number;
  price: number;
}

interface Invoice {
  id: string;
  number: string;
  client: string;
  client_email?: string;
  items: InvoiceItem[];
  total: number;
  due_date: string;
  status: "draft" | "sent" | "paid" | "overdue";
  recurring?: "weekly" | "monthly" | "yearly" | null;
  created_at: string;
  notes?: string;
}

interface PaymentLink {
  id: string;
  title: string;
  amount: number;
  url: string;
  used: number;
  max_uses?: number;
  expiry?: string;
  status: "active" | "expired";
  created_at: string;
}

const STORAGE_KEY = "vbank_invoicing_v1";

const MerchantInvoicing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [activeTab, setActiveTab] = useState<"invoices" | "links" | "subscriptions">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payLinks, setPayLinks] = useState<PaymentLink[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const [invForm, setInvForm] = useState({
    client: "", client_email: "", due_days: "14",
    items: [{ description: "", quantity: 1, price: 0 }],
    notes: "", recurring: "" as Invoice["recurring"],
  });
  const [linkForm, setLinkForm] = useState({ title: "", amount: "", maxUses: "", expiryDays: "30" });

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: p } = await supabase.from("profiles").select("vendor_id").eq("id", user.id).single();
    setVendorId((p as any)?.vendor_id || user.id.slice(0, 8).toUpperCase());
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) { const d = JSON.parse(raw); setInvoices(d.invoices || []); setPayLinks(d.links || []); }
  };

  const saveAll = (inv: Invoice[], lnk: PaymentLink[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify({ invoices: inv, links: lnk }));
    setInvoices(inv); setPayLinks(lnk);
  };

  const invTotal = (items: InvoiceItem[]) => items.reduce((s, i) => s + i.quantity * i.price, 0);

  const addInvItem = () => setInvForm({ ...invForm, items: [...invForm.items, { description: "", quantity: 1, price: 0 }] });
  const updateInvItem = (i: number, field: keyof InvoiceItem, val: string) => {
    const items = [...invForm.items];
    items[i] = { ...items[i], [field]: field === "description" ? val : parseFloat(val) || 0 };
    setInvForm({ ...invForm, items });
  };

  const createInvoice = () => {
    if (!invForm.client || invForm.items.every(i => !i.description)) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const total = invTotal(invForm.items);
    const num = `INV-${Date.now().toString().slice(-6)}`;
    const newInv: Invoice = {
      id: `inv-${Date.now()}`, number: num, client: invForm.client,
      client_email: invForm.client_email, items: invForm.items,
      total, due_date: addDays(new Date(), parseInt(invForm.due_days) || 14).toISOString(),
      status: "draft", recurring: invForm.recurring || null, created_at: new Date().toISOString(),
      notes: invForm.notes,
    };
    saveAll([newInv, ...invoices], payLinks);
    setCreateOpen(false);
    setInvForm({ client: "", client_email: "", due_days: "14", items: [{ description: "", quantity: 1, price: 0 }], notes: "", recurring: null });
    toast({ title: "Invoice created!", description: `${num} for $${total.toFixed(2)}` });
  };

  const sendInvoice = (id: string) => {
    const updated = invoices.map(inv => inv.id === id ? { ...inv, status: "sent" as const } : inv);
    saveAll(updated, payLinks);
    toast({ title: "Invoice sent!" });
  };

  const markPaid = (id: string) => {
    const updated = invoices.map(inv => inv.id === id ? { ...inv, status: "paid" as const } : inv);
    saveAll(updated, payLinks);
    toast({ title: "Invoice marked as paid" });
  };

  const deleteInvoice = (id: string) => saveAll(invoices.filter(i => i.id !== id), payLinks);

  const createPayLink = () => {
    if (!linkForm.title || !linkForm.amount) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const slug = `NETLIFE-${Date.now().toString(36).toUpperCase()}`;
    const newLink: PaymentLink = {
      id: `lnk-${Date.now()}`, title: linkForm.title, amount: parseFloat(linkForm.amount),
      url: `https://pay.netlifecash.com/${slug}`, used: 0,
      max_uses: linkForm.maxUses ? parseInt(linkForm.maxUses) : undefined,
      expiry: addDays(new Date(), parseInt(linkForm.expiryDays) || 30).toISOString(),
      status: "active", created_at: new Date().toISOString(),
    };
    saveAll(invoices, [newLink, ...payLinks]);
    setLinkOpen(false);
    setLinkForm({ title: "", amount: "", maxUses: "", expiryDays: "30" });
    toast({ title: "Payment link created!" });
  };

  const copyLink = (url: string) => { navigator.clipboard.writeText(url); toast({ title: "Link copied!" }); };

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
  const pendingRevenue = invoices.filter(i => i.status === "sent").reduce((s, i) => s + i.total, 0);

  const STATUS_COLORS: Record<string, string> = {
    draft: "outline", sent: "secondary", paid: "default", overdue: "destructive",
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> Invoicing & Payments</h1>
            <p className="text-xs text-primary-foreground/70">Payment links · Invoicing · Subscriptions</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/20 rounded-xl p-2 text-center">
            <p className="text-xs text-primary-foreground/70">Collected</p>
            <p className="font-bold">${totalRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-2 text-center">
            <p className="text-xs text-primary-foreground/70">Pending</p>
            <p className="font-bold">${pendingRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white/20 rounded-xl p-2 text-center">
            <p className="text-xs text-primary-foreground/70">Invoices</p>
            <p className="font-bold">{invoices.length}</p>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <div className="flex gap-2">
          {(["invoices", "links", "subscriptions"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "invoices" && (
          <div className="space-y-3">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2"><Plus className="h-4 w-4" /> Create Invoice</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Client Name *</Label><Input value={invForm.client} onChange={e => setInvForm({ ...invForm, client: e.target.value })} /></div>
                    <div><Label>Client Email</Label><Input type="email" value={invForm.client_email} onChange={e => setInvForm({ ...invForm, client_email: e.target.value })} /></div>
                    <div><Label>Due (days)</Label><Input type="number" value={invForm.due_days} onChange={e => setInvForm({ ...invForm, due_days: e.target.value })} /></div>
                    <div>
                      <Label>Recurring</Label>
                      <Select value={invForm.recurring || ""} onValueChange={v => setInvForm({ ...invForm, recurring: v as Invoice["recurring"] })}>
                        <SelectTrigger><SelectValue placeholder="One-time" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">One-time</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Line Items *</Label>
                      <Button size="sm" variant="outline" onClick={addInvItem}><Plus className="h-3 w-3" /></Button>
                    </div>
                    {invForm.items.map((item, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 mb-2">
                        <Input className="col-span-2" placeholder="Description" value={item.description} onChange={e => updateInvItem(i, "description", e.target.value)} />
                        <Input type="number" placeholder="Qty" value={item.quantity || ""} onChange={e => updateInvItem(i, "quantity", e.target.value)} />
                        <Input type="number" placeholder="Price" value={item.price || ""} onChange={e => updateInvItem(i, "price", e.target.value)} />
                      </div>
                    ))}
                    <p className="text-sm font-bold text-right">Total: ${invTotal(invForm.items).toFixed(2)}</p>
                  </div>
                  <div><Label>Notes</Label><Input value={invForm.notes} onChange={e => setInvForm({ ...invForm, notes: e.target.value })} placeholder="Optional notes" /></div>
                  <Button className="w-full" onClick={createInvoice}>Create Invoice</Button>
                </div>
              </DialogContent>
            </Dialog>

            {invoices.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground"><FileText className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>No invoices yet</p></div>
            ) : (
              invoices.map(inv => (
                <Card key={inv.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-bold">{inv.number}</p>
                        <p className="text-sm text-muted-foreground">{inv.client}</p>
                        <p className="text-xs text-muted-foreground">Due: {format(new Date(inv.due_date), "MMM d, yyyy")}</p>
                        {inv.recurring && <Badge variant="secondary" className="text-xs mt-1 capitalize">{inv.recurring}</Badge>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">${inv.total.toFixed(2)}</p>
                        <Badge variant={STATUS_COLORS[inv.status] as any} className="text-xs capitalize">{inv.status}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 border-t pt-2">
                      {inv.status === "draft" && <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => sendInvoice(inv.id)}><Send className="h-3 w-3" /> Send</Button>}
                      {inv.status === "sent" && <Button size="sm" className="flex-1 gap-1" onClick={() => markPaid(inv.id)}><CheckCircle className="h-3 w-3" /> Mark Paid</Button>}
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => deleteInvoice(inv.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "links" && (
          <div className="space-y-3">
            <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2"><Link className="h-4 w-4" /> Create Payment Link</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Payment Link</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Title *</Label><Input value={linkForm.title} onChange={e => setLinkForm({ ...linkForm, title: e.target.value })} placeholder="e.g. Logo Design" /></div>
                  <div><Label>Amount ($) *</Label><Input type="number" value={linkForm.amount} onChange={e => setLinkForm({ ...linkForm, amount: e.target.value })} /></div>
                  <div><Label>Max Uses</Label><Input type="number" value={linkForm.maxUses} onChange={e => setLinkForm({ ...linkForm, maxUses: e.target.value })} placeholder="Leave empty for unlimited" /></div>
                  <div><Label>Expires (days)</Label><Input type="number" value={linkForm.expiryDays} onChange={e => setLinkForm({ ...linkForm, expiryDays: e.target.value })} /></div>
                  <Button className="w-full" onClick={createPayLink}>Generate Link</Button>
                </div>
              </DialogContent>
            </Dialog>

            {payLinks.map(link => (
              <Card key={link.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div><p className="font-semibold">{link.title}</p><p className="text-xs text-muted-foreground">{link.used} uses {link.max_uses ? `/ ${link.max_uses} max` : ""}</p>
                      {link.expiry && <p className="text-xs text-muted-foreground">Expires {format(new Date(link.expiry), "MMM d")}</p>}</div>
                    <div className="text-right"><p className="text-xl font-bold">${link.amount.toFixed(2)}</p>
                      <Badge variant={link.status === "active" ? "default" : "destructive"} className="text-xs">{link.status}</Badge></div>
                  </div>
                  <div className="flex items-center gap-2 bg-muted rounded p-2 text-xs text-muted-foreground mb-2">
                    <Link className="h-3 w-3 shrink-0" />
                    <span className="truncate">{link.url}</span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => copyLink(link.url)}>
                    <Copy className="h-3 w-3" /> Copy Link
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "subscriptions" && (
          <div className="space-y-3">
            <Card className="border-dashed">
              <CardContent className="p-6 text-center">
                <RefreshCw className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="font-medium">Subscription Billing</p>
                <p className="text-sm text-muted-foreground mb-4">Recurring invoices are charged automatically. Create an invoice with recurring frequency to get started.</p>
                <Button onClick={() => { setActiveTab("invoices"); setCreateOpen(true); }}>Create Recurring Invoice</Button>
              </CardContent>
            </Card>
            {invoices.filter(i => i.recurring).map(inv => (
              <Card key={inv.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div><p className="font-semibold">{inv.client}</p><p className="text-xs text-muted-foreground">{inv.items[0]?.description}</p></div>
                    <div className="text-right"><p className="font-bold">${inv.total.toFixed(2)}</p>
                      <Badge variant="secondary" className="text-xs capitalize">{inv.recurring}</Badge></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MerchantInvoicing;

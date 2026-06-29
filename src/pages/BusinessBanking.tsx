import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Briefcase, Users, DollarSign, Building2, Send,
  FileText, RefreshCw, BarChart3, Plus, CheckCircle, Clock,
  UserCheck, PlusCircle, Upload, Download, ShoppingBag,
} from "lucide-react";

interface CorpWallet {
  id: string;
  name: string;
  type: "corporate" | "payroll" | "treasury" | "vendor";
  balance: number;
  account_number: string;
  created_at: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  salary: number;
  wallet: string;
  status: "active" | "pending";
}

interface Vendor {
  id: string;
  name: string;
  category: string;
  total_paid: number;
  last_payment: string;
  account: string;
}

const STORAGE_KEY = "vbank_business_v1";

const BusinessBanking = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [userId, setUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"wallets" | "payroll" | "vendors">("wallets");
  const [wallets, setWallets] = useState<CorpWallet[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [addEmpOpen, setAddEmpOpen] = useState(false);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [walletForm, setWalletForm] = useState({ name: "", type: "corporate" as const, deposit: "" });
  const [empForm, setEmpForm] = useState({ name: "", role: "", salary: "", wallet: "" });
  const [vendorForm, setVendorForm] = useState({ name: "", category: "", account: "" });

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) {
      const d = JSON.parse(raw);
      setWallets(d.wallets || []);
      setEmployees(d.employees || []);
      setVendors(d.vendors || []);
    } else {
      const defaults = {
        wallets: [
          { id: "corp-1", name: "Corporate Main", type: "corporate" as const, balance: 0, account_number: "BIZ-001", created_at: new Date().toISOString() },
        ],
        employees: [],
        vendors: [],
      };
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(defaults));
      setWallets(defaults.wallets);
    }
  };

  const saveAll = (w: CorpWallet[], e: Employee[], v: Vendor[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify({ wallets: w, employees: e, vendors: v }));
    setWallets(w);
    setEmployees(e);
    setVendors(v);
  };

  const createWallet = () => {
    if (!walletForm.name) { toast({ title: "Enter wallet name", variant: "destructive" }); return; }
    const newW: CorpWallet = {
      id: `corp-${Date.now()}`,
      name: walletForm.name,
      type: walletForm.type,
      balance: parseFloat(walletForm.deposit) || 0,
      account_number: `BIZ-${Date.now().toString().slice(-4)}`,
      created_at: new Date().toISOString(),
    };
    saveAll([...wallets, newW], employees, vendors);
    setCreateOpen(false);
    setWalletForm({ name: "", type: "corporate", deposit: "" });
    toast({ title: "Wallet created!" });
  };

  const addEmployee = () => {
    if (!empForm.name || !empForm.salary) { toast({ title: "Fill required fields", variant: "destructive" }); return; }
    const newE: Employee = {
      id: `emp-${Date.now()}`,
      name: empForm.name,
      role: empForm.role,
      salary: parseFloat(empForm.salary),
      wallet: empForm.wallet,
      status: "active",
    };
    saveAll(wallets, [...employees, newE], vendors);
    setAddEmpOpen(false);
    setEmpForm({ name: "", role: "", salary: "", wallet: "" });
    toast({ title: "Employee added!" });
  };

  const runPayroll = async () => {
    if (employees.length === 0) { toast({ title: "No employees to pay", variant: "destructive" }); return; }
    const totalPayroll = employees.reduce((s, e) => s + e.salary, 0);
    const payrollWallet = wallets.find(w => w.type === "payroll");
    if (!payrollWallet || payrollWallet.balance < totalPayroll) {
      toast({ variant: "destructive", title: "Insufficient payroll wallet balance" });
      return;
    }
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1500));
    const updatedWallets = wallets.map(w =>
      w.id === payrollWallet.id ? { ...w, balance: w.balance - totalPayroll } : w
    );
    saveAll(updatedWallets, employees, vendors);
    setProcessing(false);
    toast({ title: "Payroll processed!", description: `$${totalPayroll.toFixed(2)} disbursed to ${employees.length} employees` });
  };

  const addVendor = () => {
    if (!vendorForm.name) { toast({ title: "Enter vendor name", variant: "destructive" }); return; }
    const newV: Vendor = {
      id: `vendor-${Date.now()}`,
      name: vendorForm.name,
      category: vendorForm.category,
      total_paid: 0,
      last_payment: "",
      account: vendorForm.account,
    };
    saveAll(wallets, employees, [...vendors, newV]);
    setAddVendorOpen(false);
    setVendorForm({ name: "", category: "", account: "" });
    toast({ title: "Vendor added!" });
  };

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
  const totalPayroll = employees.reduce((s, e) => s + e.salary, 0);

  const WALLET_COLORS: Record<string, string> = {
    corporate: "from-blue-500 to-blue-700",
    payroll: "from-green-500 to-green-700",
    treasury: "from-teal-500 to-teal-700",
    vendor: "from-purple-500 to-purple-700",
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Briefcase className="h-5 w-5" /> Business Banking</h1>
            <p className="text-xs text-primary-foreground/70">Corporate wallets · Payroll · Vendors</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Float",    value: `$${totalBalance.toFixed(2)}`,  icon: DollarSign },
            { label: "Monthly Payroll", value: `$${totalPayroll.toFixed(2)}`, icon: Users },
            { label: "Wallets",         value: `${wallets.length}`,           icon: Building2 },
          ].map(stat => (
            <div key={stat.label} className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-xs text-primary-foreground/70">{stat.label}</p>
              <p className="font-bold text-sm">{stat.value}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="p-4 space-y-4">
        <Button
          variant="outline"
          className="w-full gap-2 border-slate-300 justify-start"
          onClick={() => navigate("/api-integrations")}
        >
          <Download className="h-4 w-4 text-slate-600" />
          <span className="font-medium">API Integrations</span>
          <span className="ml-auto text-xs text-muted-foreground">Keys · Webhooks · Apps</span>
        </Button>
        <div className="flex gap-2">
          {(["wallets", "payroll", "vendors"] as const).map(tab => (
            <button key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium capitalize transition-all ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "wallets" && (
          <div className="space-y-3">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2"><Plus className="h-4 w-4" /> Create Business Wallet</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Business Wallet</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Wallet Name *</Label>
                    <Input value={walletForm.name} onChange={e => setWalletForm({ ...walletForm, name: e.target.value })} placeholder="e.g. Operations Fund" />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {(["corporate", "payroll", "treasury", "vendor"] as const).map(t => (
                        <button key={t}
                          onClick={() => setWalletForm({ ...walletForm, type: t })}
                          className={`p-2 rounded-lg border text-sm capitalize transition-all ${walletForm.type === t ? "border-primary bg-primary/10 font-medium" : "border-border"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Initial Deposit ($)</Label>
                    <Input type="number" value={walletForm.deposit} onChange={e => setWalletForm({ ...walletForm, deposit: e.target.value })} placeholder="0.00" />
                  </div>
                  <Button className="w-full" onClick={createWallet}>Create</Button>
                </div>
              </DialogContent>
            </Dialog>

            {wallets.map(wallet => (
              <Card key={wallet.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 bg-gradient-to-br ${WALLET_COLORS[wallet.type] || "from-gray-400 to-gray-600"} rounded-2xl flex items-center justify-center shrink-0`}>
                      <Building2 className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{wallet.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{wallet.type} · {wallet.account_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">${wallet.balance.toFixed(2)}</p>
                      <Badge variant="outline" className="text-xs capitalize">{wallet.type}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 border-t pt-3">
                    <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => navigate("/send-money")}>
                      <Send className="h-3 w-3" /> Transfer
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => navigate("/deposit")}>
                      <Download className="h-3 w-3" /> Fund
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "payroll" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Dialog open={addEmpOpen} onOpenChange={setAddEmpOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex-1 gap-2"><UserCheck className="h-4 w-4" /> Add Employee</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Full Name *</Label><Input value={empForm.name} onChange={e => setEmpForm({ ...empForm, name: e.target.value })} placeholder="Employee name" /></div>
                    <div><Label>Role / Position</Label><Input value={empForm.role} onChange={e => setEmpForm({ ...empForm, role: e.target.value })} placeholder="e.g. Cashier" /></div>
                    <div><Label>Monthly Salary ($) *</Label><Input type="number" value={empForm.salary} onChange={e => setEmpForm({ ...empForm, salary: e.target.value })} placeholder="0.00" /></div>
                    <div><Label>Wallet / Account</Label><Input value={empForm.wallet} onChange={e => setEmpForm({ ...empForm, wallet: e.target.value })} placeholder="Account or phone number" /></div>
                    <Button className="w-full" onClick={addEmployee}>Add Employee</Button>
                  </div>
                </DialogContent>
              </Dialog>
              <Button className="flex-1 gap-2" onClick={runPayroll} disabled={processing}>
                {processing ? <><RefreshCw className="h-4 w-4 animate-spin" /> Processing...</> : <><Send className="h-4 w-4" /> Run Payroll</>}
              </Button>
            </div>

            {totalPayroll > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Monthly Payroll Total</p>
                    <p className="text-xs text-muted-foreground">{employees.length} employees</p>
                  </div>
                  <p className="text-2xl font-bold text-green-700">${totalPayroll.toFixed(2)}</p>
                </CardContent>
              </Card>
            )}

            {employees.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>No employees added yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {employees.map(emp => (
                  <Card key={emp.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold">{emp.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.role || "Employee"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm">${emp.salary.toFixed(2)}/mo</p>
                        <Badge variant={emp.status === "active" ? "default" : "secondary"} className="text-xs">{emp.status}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "vendors" && (
          <div className="space-y-4">
            <Dialog open={addVendorOpen} onOpenChange={setAddVendorOpen}>
              <DialogTrigger asChild>
                <Button className="w-full gap-2"><PlusCircle className="h-4 w-4" /> Add Vendor</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Vendor Name *</Label><Input value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="e.g. Office Supplies Co." /></div>
                  <div><Label>Category</Label><Input value={vendorForm.category} onChange={e => setVendorForm({ ...vendorForm, category: e.target.value })} placeholder="e.g. Supplies, Logistics" /></div>
                  <div><Label>Payment Account</Label><Input value={vendorForm.account} onChange={e => setVendorForm({ ...vendorForm, account: e.target.value })} placeholder="Bank account / phone" /></div>
                  <Button className="w-full" onClick={addVendor}>Add Vendor</Button>
                </div>
              </DialogContent>
            </Dialog>

            {vendors.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p>No vendors added yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {vendors.map(v => (
                  <Card key={v.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center shrink-0">
                        <ShoppingBag className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.category || "Vendor"}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigate("/send-money")}>Pay</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Fix missing import

export default BusinessBanking;

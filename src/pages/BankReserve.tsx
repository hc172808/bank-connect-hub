/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownToLine, ArrowLeft, ArrowUpFromLine, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isFeatureEnabled } from "@/lib/featureToggles";

type Person = { id: string; full_name: string | null; phone_number: string | null };
type Reserve = { balance: number; low_balance_threshold: number; currency: string; is_low: boolean; updated_at: string };
type AgentBalance = Person & { balance: number };

const BankReserve = () => {
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { toast } = useToast();
  const isStaff = role === "admin" || role === "founder";
  const [reserve, setReserve] = useState<Reserve | null>(null);
  const [agents, setAgents] = useState<AgentBalance[]>([]);
  const [recipients, setRecipients] = useState<Person[]>([]);
  const [myBalance, setMyBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBalance, setNewBalance] = useState("");
  const [threshold, setThreshold] = useState("");
  const [grantAgent, setGrantAgent] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantNotes, setGrantNotes] = useState("");
  const [recipient, setRecipient] = useState("");
  const [distributionAmount, setDistributionAmount] = useState("");
  const [distributionNotes, setDistributionNotes] = useState("");
  const [internalFundsEnabled, setInternalFundsEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setInternalFundsEnabled(await isFeatureEnabled("internal_funds").catch(() => false));
    if (isStaff) {
      const [snapshotResult, rolesResult, ledgerResult] = await Promise.all([
        (supabase as any).rpc("get_bank_reserve_snapshot"),
        supabase.from("user_roles").select("user_id").eq("role", "agent"),
        (supabase as any).from("bank_reserve_ledger").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      if (snapshotResult.error) {
        toast({ title: "Reserve unavailable", description: snapshotResult.error.message, variant: "destructive" });
      } else if (snapshotResult.data?.success) {
        const next = snapshotResult.data as Reserve;
        setReserve(next);
        setNewBalance(String(Number(next.balance).toFixed(2)));
        setThreshold(String(Number(next.low_balance_threshold).toFixed(2)));
      }

      const agentIds = (rolesResult.data || []).map((row: any) => row.user_id);
      if (agentIds.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone_number").in("id", agentIds);
        const { data: wallets } = await supabase.from("wallets").select("user_id, balance").in("user_id", agentIds);
        const walletMap = Object.fromEntries((wallets || []).map((wallet: any) => [wallet.user_id, Number(wallet.balance || 0)]));
        setAgents((profiles || []).map((profile: any) => ({ ...profile, balance: walletMap[profile.id] || 0 })));
      } else {
        setAgents([]);
      }
      void ledgerResult;
    } else if (user) {
      const { data } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
      setMyBalance(Number(data?.balance || 0));
      const { data: clientRoles } = await supabase.from("user_roles").select("user_id").in("role", ["client", "vendor"]);
      const ids = (clientRoles || []).map((row: any) => row.user_id).filter((id: string) => id !== user.id);
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, phone_number").in("id", ids).order("full_name");
        setRecipients((profiles || []) as Person[]);
      }
    }
    setLoading(false);
  }, [isStaff, toast, user]);

  // The loader synchronizes the page with the authenticated database state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const saveReserve = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("set_bank_reserve", {
      _balance: Number(newBalance),
      _low_balance_threshold: Number(threshold),
      _notes: "Reserve settings updated from dashboard",
    });
    setSaving(false);
    if (error || !data?.success) {
      toast({ title: "Could not update reserve", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Reserve updated", description: "The new balance and alert threshold are now active." });
    void load();
  };

  const grantFunds = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("grant_bank_reserve_to_agent", {
      _agent_id: grantAgent,
      _amount: Number(grantAmount),
      _notes: grantNotes || null,
    });
    setSaving(false);
    if (error || !data?.success) {
      toast({ title: "Could not fund agent", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Agent funded", description: "The amount was deducted from the bank reserve and added to the agent wallet." });
    setGrantAmount(""); setGrantNotes(""); setGrantAgent("");
    void load();
  };

  const distributeFunds = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("agent_distribute_funds", {
      _receiver_id: recipient,
      _amount: Number(distributionAmount),
      _description: distributionNotes || null,
    });
    setSaving(false);
    if (error || !data?.success) {
      toast({ title: "Distribution failed", description: error?.message || data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Funds distributed", description: "The recipient wallet and transaction record were updated." });
    setDistributionAmount(""); setDistributionNotes(""); setRecipient("");
    void load();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(isStaff ? "/admin" : "/agent")}><ArrowLeft size={20} /></Button>
          <div>
            <h1 className="text-2xl font-bold">Bank Reserve</h1>
            <p className="text-sm text-muted-foreground">Controlled funding for the agent network</p>
          </div>
          <Button variant="outline" size="icon" className="ml-auto" onClick={() => void load()}><RefreshCw size={16} /></Button>
        </div>

        {isStaff ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className={reserve?.is_low ? "border-destructive" : "border-emerald-500/30"}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wallet size={16} /> Available reserve</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{reserve ? `${reserve.currency} ${Number(reserve.balance).toFixed(2)}` : "—"}</p>
                  {reserve?.is_low && <p className="mt-2 text-sm text-destructive flex items-center gap-1"><AlertTriangle size={14} /> Below alert threshold</p>}
                </CardContent>
              </Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Alert threshold</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{reserve ? `${reserve.currency} ${Number(reserve.low_balance_threshold).toFixed(2)}` : "—"}</p><p className="text-xs text-muted-foreground mt-1">Admins and founders are notified below this amount</p></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Agent allocations</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{agents.length}</p><p className="text-xs text-muted-foreground mt-1">agents with controlled wallets</p></CardContent></Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Reserve controls</CardTitle></CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={saveReserve}>
                    <div><Label htmlFor="reserve-balance">Current reserve balance</Label><Input id="reserve-balance" type="number" min="0" step="0.01" value={newBalance} onChange={e => setNewBalance(e.target.value)} required /></div>
                    <div><Label htmlFor="reserve-threshold">Low-balance alert threshold</Label><Input id="reserve-threshold" type="number" min="0" step="0.01" value={threshold} onChange={e => setThreshold(e.target.value)} required /></div>
                    <Button type="submit" disabled={saving || loading} className="w-full"><ShieldCheck size={16} className="mr-2" /> Save reserve settings</Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Send reserve funds to an agent</CardTitle></CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={grantFunds}>
                    <div><Label>Agent</Label><Select value={grantAgent} onValueChange={setGrantAgent}><SelectTrigger><SelectValue placeholder="Choose an agent" /></SelectTrigger><SelectContent>{agents.map(agent => <SelectItem value={agent.id} key={agent.id}>{agent.full_name || agent.phone_number || agent.id.slice(0, 8)} · ${agent.balance.toFixed(2)}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label htmlFor="grant-amount">Amount</Label><Input id="grant-amount" type="number" min="0.01" step="0.01" value={grantAmount} onChange={e => setGrantAmount(e.target.value)} required /></div>
                    <div><Label htmlFor="grant-notes">Reference (optional)</Label><Textarea id="grant-notes" value={grantNotes} onChange={e => setGrantNotes(e.target.value)} placeholder="Why are these funds being allocated?" /></div>
                    <Button type="submit" disabled={saving || !grantAgent} className="w-full"><ArrowDownToLine size={16} className="mr-2" /> Fund agent wallet</Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Agent balances</CardTitle></CardHeader>
              <CardContent>
                {agents.length === 0 ? <p className="text-sm text-muted-foreground">No agents found.</p> : <div className="divide-y">{agents.map(agent => <div className="py-3 flex items-center justify-between" key={agent.id}><div><p className="font-medium">{agent.full_name || "Unnamed agent"}</p><p className="text-xs text-muted-foreground">{agent.phone_number || agent.id}</p></div><Badge variant="secondary">${agent.balance.toFixed(2)}</Badge></div>)}</div>}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet size={18} /> My allocated balance</CardTitle></CardHeader>
            <CardContent>
              <p className="text-4xl font-bold mb-1">${myBalance.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground mb-6">You can distribute only funds allocated to your agent wallet.</p>
              {!internalFundsEnabled ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  Internal funds are disabled by an administrator. Agent distributions are unavailable.
                </div>
              ) : <form className="space-y-4 max-w-xl" onSubmit={distributeFunds}>
                <div><Label>Recipient</Label><Select value={recipient} onValueChange={setRecipient}><SelectTrigger><SelectValue placeholder="Choose a client or vendor" /></SelectTrigger><SelectContent>{recipients.map(person => <SelectItem value={person.id} key={person.id}>{person.full_name || person.phone_number || person.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select></div>
                <div><Label htmlFor="distribution-amount">Amount</Label><Input id="distribution-amount" type="number" min="0.01" step="0.01" value={distributionAmount} onChange={e => setDistributionAmount(e.target.value)} required /></div>
                <div><Label htmlFor="distribution-notes">Reference (optional)</Label><Textarea id="distribution-notes" value={distributionNotes} onChange={e => setDistributionNotes(e.target.value)} placeholder="Distribution reference" /></div>
                <Button type="submit" disabled={saving || !recipient} className="w-full"><ArrowUpFromLine size={16} className="mr-2" /> Distribute funds</Button>
              </form>}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default BankReserve;
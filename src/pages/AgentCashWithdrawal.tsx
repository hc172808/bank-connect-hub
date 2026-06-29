import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search, Banknote, CheckCircle, XCircle, User } from "lucide-react";

interface FoundUser {
  id: string;
  full_name: string;
  phone_number: string | null;
}

interface WithdrawalRecord {
  id: string;
  client_name: string;
  amount: number;
  fee: number;
  status: "completed" | "failed";
  created_at: string;
  reference: string;
}

const WITHDRAWAL_FEE_RATE = 0.015; // 1.5%
const MIN_WITHDRAWAL = 5;
const MAX_WITHDRAWAL = 5000;

const AgentCashWithdrawal = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [selected, setSelected] = useState<FoundUser | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);

  const fee = parseFloat(amount) > 0 ? parseFloat(amount) * WITHDRAWAL_FEE_RATE : 0;
  const totalDebited = parseFloat(amount) > 0 ? parseFloat(amount) + fee : 0;

  const searchUsers = async () => {
    if (!search.trim()) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number")
      .or(`full_name.ilike.%${search}%,phone_number.ilike.%${search}%`)
      .limit(5);
    setResults((data as FoundUser[]) || []);
  };

  const processWithdrawal = async () => {
    if (!selected) return;
    const amt = parseFloat(amount);
    if (!amt || amt < MIN_WITHDRAWAL) {
      toast({ title: `Minimum withdrawal is $${MIN_WITHDRAWAL}`, variant: "destructive" });
      return;
    }
    if (amt > MAX_WITHDRAWAL) {
      toast({ title: `Maximum withdrawal is $${MAX_WITHDRAWAL.toLocaleString()}`, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user: agent } } = await supabase.auth.getUser();
      if (!agent) throw new Error("Not authenticated");

      const { data: clientWallet, error: walletErr } = await supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", selected.id)
        .single();
      if (walletErr || !clientWallet) throw new Error("Client wallet not found");

      if (clientWallet.balance < totalDebited) {
        throw new Error(`Insufficient balance. Client has $${clientWallet.balance.toFixed(2)}`);
      }

      const ref = `WDL-${Date.now().toString(36).toUpperCase()}`;
      const { error: txErr } = await supabase.from("transactions").insert({
        sender_id: selected.id,
        receiver_id: agent.id,
        amount: amt,
        fee,
        transaction_type: "withdrawal",
        status: "completed",
        description: `Cash withdrawal via agent${note ? ` – ${note}` : ""}`,
        reference: ref,
      } as never);

      if (txErr) throw txErr;

      await supabase.rpc("log_audit_event" as never, {
        _action: "agent_cash_withdrawal",
        _entity_type: "transaction",
        _entity_id: selected.id,
      } as never);

      const record: WithdrawalRecord = {
        id: `w-${Date.now()}`,
        client_name: selected.full_name,
        amount: amt,
        fee,
        status: "completed",
        created_at: new Date().toISOString(),
        reference: ref,
      };
      setHistory(prev => [record, ...prev]);

      toast({ title: "Withdrawal processed", description: `$${amt.toFixed(2)} withdrawn for ${selected.full_name}` });
      setSelected(null);
      setAmount("");
      setNote("");
      setSearch("");
      setResults([]);
    } catch (err: any) {
      toast({ title: "Withdrawal failed", description: err.message, variant: "destructive" });
      const record: WithdrawalRecord = {
        id: `w-${Date.now()}`,
        client_name: selected.full_name,
        amount: parseFloat(amount) || 0,
        fee,
        status: "failed",
        created_at: new Date().toISOString(),
        reference: `WDL-FAIL-${Date.now().toString(36).toUpperCase()}`,
      };
      setHistory(prev => [record, ...prev]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Banknote className="h-5 w-5" /> Cash Withdrawal
          </h1>
          <p className="text-xs text-primary-foreground/70">Process client cash withdrawal</p>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Fee info banner */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-xs text-blue-700">
            Fee: {(WITHDRAWAL_FEE_RATE * 100).toFixed(1)}% per withdrawal · Min ${MIN_WITHDRAWAL} · Max ${MAX_WITHDRAWAL.toLocaleString()}
          </CardContent>
        </Card>

        {/* Client search */}
        {!selected ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Find Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchUsers()}
                />
                <Button onClick={searchUsers}><Search className="h-4 w-4" /></Button>
              </div>
              {results.length > 0 && (
                <div className="space-y-2">
                  {results.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-muted"
                      onClick={() => { setSelected(u); setResults([]); }}
                    >
                      <div>
                        <p className="font-medium text-sm">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">{u.phone_number || "No phone"}</p>
                      </div>
                      <Button size="sm" variant="outline">Select</Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Selected Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded">
                <div>
                  <p className="font-medium">{selected.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selected.phone_number}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setSelected(null); setAmount(""); }}>
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Withdrawal form */}
        {selected && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4" /> Withdrawal Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Amount ($)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Input
                  placeholder="Reason or reference..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
              {parseFloat(amount) > 0 && (
                <div className="bg-muted rounded p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Withdrawal</span><strong>${parseFloat(amount).toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Fee ({(WITHDRAWAL_FEE_RATE * 100).toFixed(1)}%)</span><span>${fee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 font-bold">
                    <span>Total Debited</span><span>${totalDebited.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <Button className="w-full" onClick={processWithdrawal} disabled={loading || !amount}>
                {loading ? "Processing..." : "Process Withdrawal"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Recent withdrawal history (session) */}
        {history.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">This Session</h3>
            <div className="space-y-2">
              {history.map(h => (
                <div key={h.id} className="flex items-center gap-3 p-3 border rounded bg-card">
                  {h.status === "completed"
                    ? <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                    : <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{h.client_name}</p>
                    <p className="text-xs text-muted-foreground">{h.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">${h.amount.toFixed(2)}</p>
                    <Badge variant={h.status === "completed" ? "default" : "destructive"} className="text-xs">
                      {h.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentCashWithdrawal;

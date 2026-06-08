import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Share2, Receipt, Users, DollarSign, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Person {
  id: string;
  name: string;
  paid: boolean;
  customShare?: number;
}

const SplitBills = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [billName, setBillName] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [people, setPeople] = useState<Person[]>([
    { id: crypto.randomUUID(), name: "Me", paid: true },
  ]);
  const [newName, setNewName] = useState("");
  const [tipPct, setTipPct] = useState(0);

  const totalWithTip = parseFloat(total || "0") * (1 + tipPct / 100);
  const perPerson = people.length > 0 ? totalWithTip / people.length : 0;
  const paidCount = people.filter(p => p.paid).length;
  const owedCount = people.filter(p => !p.paid).length;
  const totalOwed = owedCount * perPerson;

  const addPerson = () => {
    if (!newName.trim()) return;
    if (people.find(p => p.name.toLowerCase() === newName.trim().toLowerCase())) {
      toast({ title: "Name already added", variant: "destructive" });
      return;
    }
    setPeople([...people, { id: crypto.randomUUID(), name: newName.trim(), paid: false }]);
    setNewName("");
  };

  const removePerson = (id: string) => {
    if (people.length <= 1) return;
    setPeople(people.filter(p => p.id !== id));
  };

  const togglePaid = (id: string) => {
    setPeople(people.map(p => p.id === id ? { ...p, paid: !p.paid } : p));
  };

  const getShare = (person: Person) => {
    if (splitMode === "custom" && person.customShare !== undefined) {
      return person.customShare;
    }
    return perPerson;
  };

  const shareText = () => {
    const lines = [
      `💰 Bill Split: ${billName || "Shared Expense"}`,
      `Total: ${currency} ${totalWithTip.toFixed(2)}${tipPct > 0 ? ` (incl. ${tipPct}% tip)` : ""}`,
      `Per person: ${currency} ${perPerson.toFixed(2)}`,
      ``,
      `Participants:`,
      ...people.map(p => `  ${p.paid ? "✅" : "⏳"} ${p.name} — ${currency} ${getShare(p).toFixed(2)}`),
      ``,
      `Send via NETLIFE CASH 💚`,
    ].join("\n");
    return lines;
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(shareText());
    toast({ title: "Copied to clipboard!" });
  };

  const shareWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText())}`;
    window.open(url, "_blank");
  };

  const reset = () => {
    setBillName("");
    setTotal("");
    setTipPct(0);
    setSplitMode("equal");
    setPeople([{ id: crypto.randomUUID(), name: "Me", paid: true }]);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Split Bills</h1>
          <p className="text-xs text-muted-foreground">Divide expenses fairly among friends</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">Reset</Button>
      </div>

      <div className="p-4 space-y-5 max-w-xl mx-auto">

        {/* Bill info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Receipt size={17} /> Bill Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Bill name (optional)</Label>
              <Input placeholder="e.g. Dinner at Restaurant, Vacation trip" value={billName} onChange={e => setBillName(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Total amount <span className="text-destructive">*</span></Label>
                <Input type="number" placeholder="0.00" step="0.01" value={total} onChange={e => setTotal(e.target.value)} />
              </div>
              <div>
                <Label>Currency</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                >
                  {["USD", "GYD", "EUR", "GBP"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Tip</Label>
              <div className="flex gap-2 flex-wrap">
                {[0, 5, 10, 15, 20].map(pct => (
                  <Button
                    key={pct}
                    variant={tipPct === pct ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTipPct(pct)}
                    className="text-xs"
                  >
                    {pct === 0 ? "No tip" : `${pct}%`}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {parseFloat(total || "0") > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-muted/30">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Total</div>
                <div className="font-bold">{currency} {totalWithTip.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className="bg-primary/5 border-primary/30">
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Per person</div>
                <div className="font-bold text-primary">{currency} {perPerson.toFixed(2)}</div>
              </CardContent>
            </Card>
            <Card className={`${owedCount > 0 ? "bg-orange-500/10 border-orange-500/30" : "bg-green-500/10 border-green-500/30"}`}>
              <CardContent className="pt-3 pb-3 text-center">
                <div className="text-xs text-muted-foreground mb-1">Still owed</div>
                <div className={`font-bold ${owedCount > 0 ? "text-orange-600" : "text-green-600"}`}>
                  {currency} {totalOwed.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Participants */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users size={17} /> Participants ({people.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Add person…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addPerson()}
                className="flex-1"
              />
              <Button onClick={addPerson} size="icon"><Plus size={16} /></Button>
            </div>

            <div className="space-y-2">
              {people.map(person => (
                <div
                  key={person.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    person.paid ? "border-green-500/40 bg-green-500/5" : "border-muted bg-muted/20"
                  }`}
                  onClick={() => togglePaid(person.id)}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                    person.paid ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {person.paid ? <CheckCircle2 size={16} /> : person.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{person.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {person.paid ? "Paid ✓" : `Owes ${currency} ${getShare(person).toFixed(2)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={person.paid ? "default" : "secondary"} className="text-xs">
                      {currency} {getShare(person).toFixed(2)}
                    </Badge>
                    {person.name !== "Me" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={e => { e.stopPropagation(); removePerson(person.id); }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center">Tap a person to mark them as paid</p>
          </CardContent>
        </Card>

        {/* Share */}
        {parseFloat(total || "0") > 0 && people.length > 1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Share2 size={17} /> Share Bill</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted rounded-lg p-3 whitespace-pre-wrap font-mono mb-3 text-muted-foreground">
                {shareText()}
              </pre>
              <div className="flex gap-2">
                <Button onClick={copyToClipboard} variant="outline" className="flex-1 gap-2">
                  <Copy size={15} /> Copy
                </Button>
                <Button onClick={shareWhatsApp} className="flex-1 gap-2 bg-green-600 hover:bg-green-700 text-white">
                  <Share2 size={15} /> WhatsApp
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SplitBills;

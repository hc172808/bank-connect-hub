import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, PlusCircle, Trash2, Users, Search, Send,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const STORAGE_KEY = "vbank_beneficiaries_v1";

interface Beneficiary {
  id: string;
  name: string;
  phone: string;
  nickname: string;
  color: string;
  added_at: string;
}

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-yellow-500",
];

const Beneficiaries = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", nickname: "" });
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<{ id: string; full_name: string } | null>(null);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    setBeneficiaries(raw ? JSON.parse(raw) : []);
  };

  const save = (list: Beneficiary[]) => {
    if (!userId) return;
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setBeneficiaries(list);
  };

  const verifyPhone = async () => {
    if (!form.phone) return;
    setVerifying(true);
    setVerified(null);
    const phone = form.phone.replace(/\s/g, "");
    const emailGuess = `${phone}@vbank.com`;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone_number")
      .eq("phone_number", phone)
      .maybeSingle();

    if (data) {
      setVerified({ id: data.id, full_name: data.full_name || phone });
      if (!form.name) setForm((f) => ({ ...f, name: data.full_name || phone }));
      toast({ title: "User found", description: `${data.full_name || phone} is on NETLIFE CASH` });
    } else {
      toast({ title: "User not found", description: "No account with that phone number", variant: "destructive" });
    }
    setVerifying(false);
  };

  const addBeneficiary = () => {
    if (!form.name || !form.phone) {
      toast({ title: "Name and phone are required", variant: "destructive" });
      return;
    }
    const exists = beneficiaries.find((b) => b.phone === form.phone.replace(/\s/g, ""));
    if (exists) {
      toast({ title: "Already added", description: "This number is already in your list.", variant: "destructive" });
      return;
    }
    const b: Beneficiary = {
      id: crypto.randomUUID(),
      name: form.name,
      phone: form.phone.replace(/\s/g, ""),
      nickname: form.nickname || form.name.split(" ")[0],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      added_at: new Date().toISOString(),
    };
    save([...beneficiaries, b]);
    setOpen(false);
    setForm({ name: "", phone: "", nickname: "" });
    setVerified(null);
    toast({ title: "Beneficiary added", description: b.nickname });
  };

  const remove = (id: string) => {
    save(beneficiaries.filter((b) => b.id !== id));
    toast({ title: "Beneficiary removed" });
  };

  const sendTo = (b: Beneficiary) => {
    navigate(`/send-money?phone=${encodeURIComponent(b.phone)}&name=${encodeURIComponent(b.name)}`);
  };

  const filtered = beneficiaries.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.phone.includes(search) ||
    b.nickname.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Beneficiaries</h1>
            <p className="text-muted-foreground text-sm">{beneficiaries.length} saved contacts</p>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setVerified(null); setForm({ name: "", phone: "", nickname: "" }); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><PlusCircle size={16} className="mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Beneficiary</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Phone Number</Label>
                  <div className="flex gap-2 mt-1">
                    <Input placeholder="+592..." value={form.phone}
                      onChange={(e) => { setForm({ ...form, phone: e.target.value }); setVerified(null); }} />
                    <Button variant="outline" size="sm" onClick={verifyPhone} disabled={verifying}>
                      {verifying ? "…" : "Verify"}
                    </Button>
                  </div>
                  {verified && (
                    <p className="text-xs text-green-600 mt-1">✓ {verified.full_name}</p>
                  )}
                </div>
                <div>
                  <Label>Full Name</Label>
                  <Input placeholder="John Doe" value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div>
                  <Label>Nickname (optional)</Label>
                  <Input placeholder="e.g. Dad, Boss" value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
                </div>
                <Button className="w-full" onClick={addBeneficiary}>Add Beneficiary</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {beneficiaries.length > 0 && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name or phone…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}

        {/* Quick-scroll row */}
        {beneficiaries.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-3 mb-4">
            {beneficiaries.slice(0, 8).map((b) => (
              <button key={b.id} onClick={() => sendTo(b)}
                className="flex flex-col items-center gap-1 min-w-[56px]">
                <Avatar className={`w-12 h-12 ${b.color}`}>
                  <AvatarFallback className="bg-transparent text-white font-bold text-sm">
                    {b.nickname.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-center truncate w-14">{b.nickname}</span>
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="mx-auto mb-3 text-muted-foreground" size={40} />
              <p className="text-muted-foreground mb-4">
                {beneficiaries.length === 0 ? "No beneficiaries saved yet." : "No matches found."}
              </p>
              {beneficiaries.length === 0 && (
                <Button onClick={() => setOpen(true)}>
                  <PlusCircle size={16} className="mr-2" /> Add your first beneficiary
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Avatar className={`w-11 h-11 ${b.color}`}>
                    <AvatarFallback className="bg-transparent text-white font-bold">
                      {b.nickname.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.phone}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-8 text-xs" onClick={() => sendTo(b)}>
                      <Send size={13} className="mr-1" /> Send
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
                      onClick={() => remove(b.id)}>
                      <Trash2 size={14} />
                    </Button>
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

export default Beneficiaries;

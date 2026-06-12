import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Users, Plus, DollarSign, CheckCircle, Clock,
  Copy, UserPlus, Send, AlertCircle,
} from "lucide-react";

interface GroupMember {
  id: string;
  name: string;
  phone: string;
  share: number;
  paid: boolean;
}

interface GroupPayment {
  id: string;
  title: string;
  description: string;
  total: number;
  creator: string;
  members: GroupMember[];
  created_at: string;
  due_date: string;
  status: "active" | "completed" | "expired";
}

const STORAGE_KEY = "vbank_group_payments_v1";
const COLORS = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500"];

const GroupPayments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupPayment[]>([]);
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    title: "",
    description: "",
    total: "",
    due_date: "",
    members: [{ name: "", phone: "" }],
  });

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();
    setUserName((profile as any)?.full_name || "You");
    const raw = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (raw) setGroups(JSON.parse(raw));
  };

  const save = (list: GroupPayment[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(list));
    setGroups(list);
  };

  const addMemberField = () => {
    if (form.members.length >= 10) { toast({ title: "Max 10 members" }); return; }
    setForm({ ...form, members: [...form.members, { name: "", phone: "" }] });
  };

  const updateMember = (i: number, field: "name" | "phone", val: string) => {
    const m = [...form.members];
    m[i] = { ...m[i], [field]: val };
    setForm({ ...form, members: m });
  };

  const createGroup = () => {
    if (!form.title || !form.total) { toast({ title: "Fill in required fields", variant: "destructive" }); return; }
    const total = parseFloat(form.total);
    const validMembers = form.members.filter(m => m.name.trim());
    const allMembers: GroupMember[] = [
      { id: userId, name: userName, phone: "", share: total / (validMembers.length + 1), paid: false },
      ...validMembers.map((m, i) => ({
        id: `member-${i}`,
        name: m.name,
        phone: m.phone,
        share: total / (validMembers.length + 1),
        paid: false,
      })),
    ];
    const dueDate = form.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const group: GroupPayment = {
      id: `gp-${Date.now()}`,
      title: form.title,
      description: form.description,
      total,
      creator: userId,
      members: allMembers,
      created_at: new Date().toISOString(),
      due_date: dueDate,
      status: "active",
    };
    save([group, ...groups]);
    setCreateOpen(false);
    setForm({ title: "", description: "", total: "", due_date: "", members: [{ name: "", phone: "" }] });
    toast({ title: "Group payment created!" });
  };

  const markPaid = (groupId: string, memberId: string) => {
    const updated = groups.map(g => {
      if (g.id !== groupId) return g;
      const members = g.members.map(m => m.id === memberId ? { ...m, paid: true } : m);
      const allPaid = members.every(m => m.paid);
      return { ...g, members, status: allPaid ? "completed" as const : g.status };
    });
    save(updated);
    toast({ title: "Payment marked as received" });
  };

  const copyLink = (group: GroupPayment) => {
    const text = `${group.title} — Pay your share of $${group.members.find(m => m.id !== userId)?.share.toFixed(2) || "0"} via NETLIFE CASH. Group ID: ${group.id}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Payment link copied!" });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5" /> Group Payments
            </h1>
            <p className="text-xs text-primary-foreground/70">Collect money from groups</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary"><Plus className="h-4 w-4 mr-1" /> Create</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Group Payment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Title *</Label>
                <Input placeholder="e.g. Birthday dinner split" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Input placeholder="Optional details" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label>Total Amount ($) *</Label>
                <Input type="number" placeholder="0.00" value={form.total}
                  onChange={e => setForm({ ...form, total: e.target.value })} />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Members (you are included)</Label>
                  <Button size="sm" variant="outline" onClick={addMemberField}>
                    <UserPlus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.members.map((m, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2">
                      <Input placeholder={`Name ${i + 1}`} value={m.name}
                        onChange={e => updateMember(i, "name", e.target.value)} />
                      <Input placeholder="Phone (optional)" value={m.phone}
                        onChange={e => updateMember(i, "phone", e.target.value)} />
                    </div>
                  ))}
                </div>
                {form.total && form.members.filter(m => m.name).length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Each person pays ${(parseFloat(form.total) / (form.members.filter(m => m.name).length + 1)).toFixed(2)}
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={createGroup}>Create Group Payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <div className="p-4 space-y-4">
        {groups.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No group payments yet</p>
            <p className="text-sm text-muted-foreground">Create a group to split bills or collect money</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(group => {
              const paidCount = group.members.filter(m => m.paid).length;
              const totalCount = group.members.length;
              const collected = group.members.filter(m => m.paid).reduce((s, m) => s + m.share, 0);
              const pct = (collected / group.total) * 100;

              return (
                <Card key={group.id} className={group.status === "completed" ? "border-green-200" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{group.title}</CardTitle>
                      <Badge variant={group.status === "completed" ? "default" : "secondary"} className="capitalize">
                        {group.status === "completed"
                          ? <><CheckCircle className="h-3 w-3 mr-1" />Done</>
                          : <><Clock className="h-3 w-3 mr-1" />Active</>}
                      </Badge>
                    </div>
                    {group.description && <CardDescription>{group.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Collected</p>
                        <p className="text-xl font-bold">${collected.toFixed(2)} <span className="text-sm text-muted-foreground">/ ${group.total.toFixed(2)}</span></p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{paidCount}/{totalCount} paid</p>
                        <p>Due {group.due_date}</p>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />

                    {/* Members */}
                    <div className="space-y-2">
                      {group.members.map((member, mi) => (
                        <div key={member.id} className="flex items-center gap-3">
                          <div className={`w-8 h-8 ${COLORS[mi % COLORS.length]} rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0`}>
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {member.name}
                              {member.id === userId && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">${member.share.toFixed(2)}</p>
                          </div>
                          {member.paid
                            ? <Badge variant="default" className="text-xs shrink-0"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>
                            : group.creator === userId && member.id !== userId
                              ? <Button size="sm" variant="outline" className="text-xs shrink-0"
                                  onClick={() => markPaid(group.id, member.id)}>
                                  Mark Paid
                                </Button>
                              : <Badge variant="secondary" className="text-xs shrink-0"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                          }
                        </div>
                      ))}
                    </div>

                    {group.status === "active" && (
                      <div className="flex gap-2 pt-1 border-t">
                        <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => copyLink(group)}>
                          <Copy className="h-3 w-3" /> Copy Link
                        </Button>
                        <Button size="sm" className="flex-1 gap-1" onClick={() => navigate("/send-money")}>
                          <Send className="h-3 w-3" /> Remind
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GroupPayments;

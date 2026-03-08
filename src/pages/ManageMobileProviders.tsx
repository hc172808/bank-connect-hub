import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Provider {
  id: string;
  name: string;
  ussd_code: string | null;
  logo_letter: string;
  color: string;
  merchant_number: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
}

const emptyForm = {
  name: "",
  ussd_code: "",
  logo_letter: "",
  color: "bg-primary",
  merchant_number: "",
  instructions: "",
  is_active: true,
  sort_order: 0,
};

const COLOR_OPTIONS = [
  { value: "bg-red-500", label: "Red" },
  { value: "bg-orange-500", label: "Orange" },
  { value: "bg-yellow-500", label: "Yellow" },
  { value: "bg-green-500", label: "Green" },
  { value: "bg-green-600", label: "Dark Green" },
  { value: "bg-blue-500", label: "Blue" },
  { value: "bg-purple-500", label: "Purple" },
  { value: "bg-pink-500", label: "Pink" },
  { value: "bg-primary", label: "Primary" },
];

const ManageMobileProviders = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    // Admin RLS policy covers ALL, so we see active + inactive
    const { data } = await supabase
      .from("mobile_money_providers")
      .select("*")
      .order("sort_order", { ascending: true });

    if (data) setProviders(data as Provider[]);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: providers.length + 1 });
    setDialogOpen(true);
  };

  const openEdit = (p: Provider) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      ussd_code: p.ussd_code || "",
      logo_letter: p.logo_letter,
      color: p.color,
      merchant_number: p.merchant_number || "",
      instructions: p.instructions || "",
      is_active: p.is_active,
      sort_order: p.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.logo_letter.trim()) {
      toast({ title: "Error", description: "Name and logo letter are required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        ussd_code: form.ussd_code.trim() || null,
        logo_letter: form.logo_letter.trim().slice(0, 2),
        color: form.color,
        merchant_number: form.merchant_number.trim() || null,
        instructions: form.instructions.trim() || null,
        is_active: form.is_active,
        sort_order: form.sort_order,
      };

      if (editingId) {
        const { error } = await supabase
          .from("mobile_money_providers")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Provider Updated" });
      } else {
        const { error } = await supabase
          .from("mobile_money_providers")
          .insert(payload);
        if (error) throw error;
        toast({ title: "Provider Added" });
      }

      setDialogOpen(false);
      fetchProviders();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("mobile_money_providers")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Provider Deleted" });
      fetchProviders();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase
      .from("mobile_money_providers")
      .update({ is_active: !current })
      .eq("id", id);
    fetchProviders();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Mobile Money Providers</h1>
          <Button onClick={openAdd}>
            <Plus size={16} className="mr-1" /> Add Provider
          </Button>
        </div>

        <div className="space-y-3">
          {providers.length === 0 ? (
            <Card className="p-8 text-center">
              <Smartphone size={32} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">No providers configured yet</p>
            </Card>
          ) : (
            providers.map((p) => (
              <Card key={p.id} className={`p-4 ${!p.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${p.color} rounded-full flex items-center justify-center text-white font-bold`}>
                      {p.logo_letter}
                    </div>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.ussd_code || "No USSD"} · {p.merchant_number || "No merchant #"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={() => toggleActive(p.id, p.is_active)}
                    />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Provider" : "Add Provider"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Provider Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Digicel MoMo" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Logo Letter(s) *</Label>
                  <Input value={form.logo_letter} onChange={(e) => setForm({ ...form, logo_letter: e.target.value.slice(0, 2) })} placeholder="D" maxLength={2} />
                </div>
                <div>
                  <Label>Color</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                  >
                    {COLOR_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label>USSD Code</Label>
                <Input value={form.ussd_code} onChange={(e) => setForm({ ...form, ussd_code: e.target.value })} placeholder="*129#" />
              </div>
              <div>
                <Label>Merchant Number</Label>
                <Input value={form.merchant_number} onChange={(e) => setForm({ ...form, merchant_number: e.target.value })} placeholder="+592-000-0001" />
              </div>
              <div>
                <Label>Custom Instructions</Label>
                <Input value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Optional extra instructions for users" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sort Order</Label>
                  <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label className="pb-0.5">{form.is_active ? "Active" : "Inactive"}</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ManageMobileProviders;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface ChangelogEntry {
  id: string;
  version: string;
  is_latest: boolean;
  items: string[];
  released_at: string;
}

const ManageChangelog = () => {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [isLatest, setIsLatest] = useState(false);
  const [items, setItems] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    const { data } = await supabase
      .from("changelog_entries")
      .select("*")
      .order("released_at", { ascending: false });
    if (data) setEntries(data.map((d: any) => ({ ...d, items: d.items as string[] })));
  };

  const openAdd = () => {
    setEditingId(null);
    setVersion("");
    setIsLatest(true);
    setItems([""]);
    setDialogOpen(true);
  };

  const openEdit = (e: ChangelogEntry) => {
    setEditingId(e.id);
    setVersion(e.version);
    setIsLatest(e.is_latest);
    setItems(e.items.length ? [...e.items] : [""]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const cleanItems = items.map(i => i.trim()).filter(Boolean);
    if (!version.trim() || cleanItems.length === 0) {
      toast({ title: "Error", description: "Version and at least one item are required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // If marking as latest, unmark others
      if (isLatest) {
        await supabase.from("changelog_entries").update({ is_latest: false } as any).eq("is_latest", true);
      }
      const payload = {
        version: version.trim(),
        is_latest: isLatest,
        items: cleanItems,
        released_at: new Date().toISOString(),
      };
      if (editingId) {
        const { error } = await supabase.from("changelog_entries").update(payload as any).eq("id", editingId);
        if (error) throw error;
        toast({ title: "Entry Updated" });
      } else {
        const { error } = await supabase.from("changelog_entries").insert(payload as any);
        if (error) throw error;
        toast({ title: "Entry Added" });
      }
      setDialogOpen(false);
      fetchEntries();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("changelog_entries").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Entry Deleted" }); fetchEntries(); }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4">
          <ArrowLeft size={20} className="mr-2" /> Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Manage Changelog</h1>
          <Button onClick={openAdd}><Plus size={16} className="mr-1" /> Add Version</Button>
        </div>

        <div className="space-y-3">
          {entries.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No changelog entries yet</p>
            </Card>
          ) : entries.map((e) => (
            <Card key={e.id} className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">v{e.version}</span>
                    {e.is_latest && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Latest</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.released_at).toLocaleDateString()}
                    </span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    {e.items.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(e)}><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(e.id)}>
                    <Trash2 size={14} className="text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Version" : "Add Version"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label>Version *</Label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.2.0" />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <Switch checked={isLatest} onCheckedChange={setIsLatest} />
                  <Label className="text-sm">Latest</Label>
                </div>
              </div>
              <div>
                <Label>Release Notes *</Label>
                <div className="space-y-2 mt-1">
                  {items.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={item}
                        onChange={(e) => { const n = [...items]; n[i] = e.target.value; setItems(n); }}
                        placeholder={`Change #${i + 1}`}
                      />
                      {items.length > 1 && (
                        <Button variant="ghost" size="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                          <X size={14} />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setItems([...items, ""])} className="w-full text-xs">
                    <Plus size={12} className="mr-1" /> Add Item
                  </Button>
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

export default ManageChangelog;

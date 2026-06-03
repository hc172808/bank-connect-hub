import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, Megaphone, Plus, Trash2, Edit } from "lucide-react";

interface Ann {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

const blank = {
  id: "",
  title: "",
  body: "",
  image_url: "",
  link_url: "",
  starts_at: new Date().toISOString().slice(0, 16),
  ends_at: "",
  is_active: true,
};

const AdminAnnouncements = () => {
  const nav = useNavigate();
  const [items, setItems] = useState<Ann[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("announcements" as never)
      .select("*")
      .order("starts_at", { ascending: false });
    setItems((data as Ann[]) || []);
  };

  const save = async () => {
    if (!form.title) return toast.error("Title required");
    const payload: Record<string, unknown> = {
      title: form.title,
      body: form.body || null,
      image_url: form.image_url || null,
      link_url: form.link_url || null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: form.is_active,
    };
    const res = form.id
      ? await supabase.from("announcements" as never).update(payload as never).eq("id", form.id)
      : await supabase.from("announcements" as never).insert(payload as never);
    if (res.error) return toast.error(res.error.message);
    toast.success("Saved");
    setOpen(false);
    setForm({ ...blank });
    void load();
  };

  const toggle = async (a: Ann) => {
    await supabase
      .from("announcements" as never)
      .update({ is_active: !a.is_active } as never)
      .eq("id", a.id);
    void load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements" as never).delete().eq("id", id);
    void load();
  };

  const edit = (a: Ann) => {
    setForm({
      id: a.id,
      title: a.title,
      body: a.body ?? "",
      image_url: a.image_url ?? "",
      link_url: a.link_url ?? "",
      starts_at: a.starts_at.slice(0, 16),
      ends_at: a.ends_at ? a.ends_at.slice(0, 16) : "",
      is_active: a.is_active,
    });
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)} className="text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Megaphone className="h-5 w-5" /> Announcements & Ads
        </h1>
      </header>

      <div className="p-4 space-y-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setForm({ ...blank })}>
              <Plus className="h-4 w-4 mr-1" /> New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Edit" : "New"} Announcement</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </div>
              <div>
                <Label>Image URL (optional)</Label>
                <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              </div>
              <div>
                <Label>Link URL (optional)</Label>
                <Input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Starts</Label>
                  <Input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Ends (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {items.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="truncate">{a.title}</span>
                <Badge variant={a.is_active ? "default" : "secondary"}>
                  {a.is_active ? "Active" : "Disabled"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {a.body && <p className="text-muted-foreground">{a.body}</p>}
              <p className="text-xs text-muted-foreground">
                {new Date(a.starts_at).toLocaleString()}
                {a.ends_at && ` → ${new Date(a.ends_at).toLocaleString()}`}
              </p>
              <div className="flex gap-2 flex-wrap">
                <Switch checked={a.is_active} onCheckedChange={() => toggle(a)} />
                <Button size="sm" variant="outline" onClick={() => edit(a)}>
                  <Edit className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => del(a.id)}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-center text-muted-foreground">No announcements yet.</p>
        )}
      </div>
    </div>
  );
};

export default AdminAnnouncements;
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Send, Users, User, Bell, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UserOption {
  id: string;
  full_name: string | null;
}

const AdminNotifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSubscribers, setPushSubscribers] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [target, setTarget] = useState<"single" | "all">("single");
  const [selectedUserId, setSelectedUserId] = useState("");

  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushUrl, setPushUrl] = useState("/");

  useEffect(() => {
    fetchUsers();
    fetchPushSubscribers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name");
    if (data) setUsers(data);
  };

  const fetchPushSubscribers = async () => {
    try {
      const r = await fetch("/api/push/subscribers");
      if (r.ok) {
        const { total } = await r.json();
        setPushSubscribers(total);
      }
    } catch {
      setPushSubscribers(0);
    }
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Title and message are required." });
      return;
    }
    if (target === "single" && !selectedUserId) {
      toast({ variant: "destructive", title: "No user selected", description: "Please select a user." });
      return;
    }

    setLoading(true);

    if (target === "single") {
      const { error } = await supabase.from("notifications").insert({
        user_id: selectedUserId, title, message, type,
      });
      if (error) toast({ variant: "destructive", title: "Error", description: error.message });
      else { toast({ title: "Notification sent!" }); resetForm(); }
    } else {
      const notifications = users.map((user) => ({ user_id: user.id, title, message, type }));
      const { error } = await supabase.from("notifications").insert(notifications);
      if (error) toast({ variant: "destructive", title: "Error", description: error.message });
      else { toast({ title: `Notification sent to ${users.length} users!` }); resetForm(); }
    }

    setLoading(false);
  };

  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast({ variant: "destructive", title: "Missing fields", description: "Push title and body are required." });
      return;
    }
    setPushLoading(true);
    try {
      const r = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pushTitle, body: pushBody, url: pushUrl || "/" }),
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: `Push sent!`, description: `Delivered to ${data.sent} device(s). Failed: ${data.failed}.` });
        setPushTitle("");
        setPushBody("");
        setPushUrl("/");
        fetchPushSubscribers();
      } else {
        toast({ variant: "destructive", title: "Push failed", description: data.error });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Network error", description: "Could not reach build server." });
    } finally {
      setPushLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setType("info");
    setSelectedUserId("");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-2">
          <ArrowLeft size={20} className="mr-2" />
          Back to Dashboard
        </Button>

        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell size={28} />
          Send Notifications
        </h1>

        {/* ── In-App Notification ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell size={18} /> In-App Notification
            </CardTitle>
            <CardDescription>Saved to the user's notification inbox inside the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Send to</Label>
              <div className="flex gap-2">
                <Button variant={target === "single" ? "default" : "outline"} onClick={() => setTarget("single")} className="flex-1">
                  <User size={16} className="mr-2" /> Single User
                </Button>
                <Button variant={target === "all" ? "default" : "outline"} onClick={() => setTarget("all")} className="flex-1">
                  <Users size={16} className="mr-2" /> All Users ({users.length})
                </Button>
              </div>
            </div>

            {target === "single" && (
              <div className="space-y-2">
                <Label>Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger><SelectValue placeholder="Choose a user..." /></SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Notification Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">ℹ️ Info</SelectItem>
                  <SelectItem value="success">✅ Success</SelectItem>
                  <SelectItem value="alert">⚠️ Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title..." />
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your notification message..." rows={3} />
            </div>

            <Button onClick={handleSend} disabled={loading} className="w-full">
              <Send size={16} className="mr-2" />
              {loading ? "Sending..." : target === "all" ? `Broadcast to ${users.length} users` : "Send Notification"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Web Push Notification ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone size={18} /> Web Push Notification
              {pushSubscribers !== null && (
                <Badge variant="secondary" className="ml-auto">
                  {pushSubscribers} subscriber{pushSubscribers !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Delivered instantly to browsers &amp; devices that opted in — even when the app isn't open.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pushSubscribers === 0 && (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                No push subscribers yet. Users can enable push notifications in Security Settings.
              </div>
            )}

            <div className="space-y-2">
              <Label>Push Title</Label>
              <Input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="e.g. Important Update" />
            </div>

            <div className="space-y-2">
              <Label>Push Body</Label>
              <Textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder="Short message shown in the device notification..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Deep-link URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={pushUrl} onChange={(e) => setPushUrl(e.target.value)} placeholder="/" />
            </div>

            <Button onClick={handleSendPush} disabled={pushLoading || pushSubscribers === 0} className="w-full">
              <Smartphone size={16} className="mr-2" />
              {pushLoading ? "Sending push..." : `Send Push to All (${pushSubscribers ?? "…"} subscribers)`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminNotifications;

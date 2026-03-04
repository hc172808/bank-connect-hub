import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Send, Users, User, Bell } from "lucide-react";
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

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("info");
  const [target, setTarget] = useState<"single" | "all">("single");
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name");

    if (data) setUsers(data);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({
        variant: "destructive",
        title: "Missing fields",
        description: "Title and message are required.",
      });
      return;
    }

    if (target === "single" && !selectedUserId) {
      toast({
        variant: "destructive",
        title: "No user selected",
        description: "Please select a user to send the notification to.",
      });
      return;
    }

    setLoading(true);

    if (target === "single") {
      const { error } = await supabase.from("notifications").insert({
        user_id: selectedUserId,
        title,
        message,
        type,
      });

      if (error) {
        toast({ variant: "destructive", title: "Error", description: error.message });
      } else {
        toast({ title: "Notification sent!" });
        resetForm();
      }
    } else {
      // Broadcast to all users
      const notifications = users.map((user) => ({
        user_id: user.id,
        title,
        message,
        type,
      }));

      const { error } = await supabase.from("notifications").insert(notifications);

      if (error) {
        toast({ variant: "destructive", title: "Error", description: error.message });
      } else {
        toast({ title: `Notification sent to ${users.length} users!` });
        resetForm();
      }
    }

    setLoading(false);
  };

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setType("info");
    setSelectedUserId("");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin")}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Dashboard
        </Button>

        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Bell size={28} />
          Send Notifications
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Compose Notification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Target */}
            <div className="space-y-2">
              <Label>Send to</Label>
              <div className="flex gap-2">
                <Button
                  variant={target === "single" ? "default" : "outline"}
                  onClick={() => setTarget("single")}
                  className="flex-1"
                >
                  <User size={16} className="mr-2" />
                  Single User
                </Button>
                <Button
                  variant={target === "all" ? "default" : "outline"}
                  onClick={() => setTarget("all")}
                  className="flex-1"
                >
                  <Users size={16} className="mr-2" />
                  All Users ({users.length})
                </Button>
              </div>
            </div>

            {/* User selector */}
            {target === "single" && (
              <div className="space-y-2">
                <Label>Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
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

            {/* Type */}
            <div className="space-y-2">
              <Label>Notification Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">ℹ️ Info</SelectItem>
                  <SelectItem value="success">✅ Success</SelectItem>
                  <SelectItem value="alert">⚠️ Alert</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Notification title..."
              />
            </div>

            {/* Message */}
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your notification message..."
                rows={4}
              />
            </div>

            <Button
              onClick={handleSend}
              disabled={loading}
              className="w-full"
            >
              <Send size={16} className="mr-2" />
              {loading
                ? "Sending..."
                : target === "all"
                ? `Broadcast to ${users.length} users`
                : "Send Notification"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminNotifications;

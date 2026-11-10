import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Bell, CheckCircle, AlertCircle, Info, Check, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

interface ChatNotificationPayload {
  text?: unknown;
  sender_id?: unknown;
}

function getChatNotificationPayload(message: string) {
  try {
    const payload = JSON.parse(message) as ChatNotificationPayload;
    return {
      text: typeof payload.text === "string" ? payload.text : "Open to view this message.",
      senderId: typeof payload.sender_id === "string" ? payload.sender_id : "",
    };
  } catch {
    return { text: "Open to view this message.", senderId: "" };
  }
}

const Notifications = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    let userId = "";
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: number | null = null;

    const fetchNotifications = async () => {
      if (!userId) return;
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .neq("type", "chat_outbox")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        setLoadError(true);
      } else {
        setLoadError(false);
        setNotifications((data || []) as Notification[]);
      }
      setLoading(false);
    };

    const initialize = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error || !user) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      userId = user.id;
      await fetchNotifications();
      if (!active) return;

      channel = supabase
        .channel(`user-notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const notification = payload.new as Notification;
            if (notification.user_id !== user.id || notification.type === "chat_outbox") return;
            setNotifications((previous) => previous.some((item) => item.id === notification.id)
              ? previous
              : [notification, ...previous]);
            if (notification.type !== "chat_message") {
              toast({
                title: notification.title,
                description: notification.message,
              });
            }
          },
        )
        .subscribe();
      refreshTimer = window.setInterval(() => void fetchNotifications(), 5000);
    };

    void initialize();
    return () => {
      active = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [toast]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    }
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast({ title: "All notifications marked as read" });
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) await markAsRead(notification.id);
    if (notification.type === "chat_message") {
      const { senderId } = getChatNotificationPayload(notification.message);
      navigate(senderId ? `/chat/${encodeURIComponent(senderId)}` : "/chat");
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle className="text-green-500" size={20} />;
      case "alert":
        return <AlertCircle className="text-destructive" size={20} />;
      case "chat_message":
        return <MessageCircle className="text-primary" size={20} />;
      default:
        return <Info className="text-primary" size={20} />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back
        </Button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <Check size={16} className="mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell size={20} />
              All Notifications
              {unreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {loadError ? (
                  <>
                    <Bell size={48} className="mx-auto mb-3 opacity-30" />
                    <p>Notifications could not be loaded.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
                      Retry
                    </Button>
                  </>
                ) : (
                  <>
                    <Bell size={48} className="mx-auto mb-3 opacity-30" />
                    <p>No notifications yet</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => {
                  const chatPayload = notification.type === "chat_message"
                    ? getChatNotificationPayload(notification.message)
                    : null;
                  return (
                  <button
                    type="button"
                    key={notification.id}
                    className={`flex gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      notification.is_read
                        ? "bg-muted/30"
                        : "bg-primary/10 hover:bg-primary/15"
                    } w-full text-left`}
                    onClick={() => void handleNotificationClick(notification)}
                  >
                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center flex-shrink-0">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-medium ${!notification.is_read ? "text-foreground" : "text-muted-foreground"}`}>
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {chatPayload?.text ?? notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(notification.created_at)}
                      </p>
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Notifications;

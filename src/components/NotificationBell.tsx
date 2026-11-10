import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const NotificationBell = () => {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshTimer: number | null = null;

    const initialize = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (!active || authError || !user) return;

      const refreshUnreadCount = async () => {
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false);
        if (!active || error) return;
        setUnreadCount(count ?? 0);
      };

      await refreshUnreadCount();
      if (!active) return;
      channel = supabase
        .channel(`bell-notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => void refreshUnreadCount(),
        )
        .subscribe();
      refreshTimer = window.setInterval(() => void refreshUnreadCount(), 5000);
    };

    void initialize();
    return () => {
      active = false;
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <button
      onClick={() => navigate("/notifications")}
      className="relative p-2 rounded-full hover:bg-foreground/10 transition-colors"
      aria-label="Notifications"
    >
      <Bell className="text-foreground" size={22} />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 bg-destructive text-white text-xs rounded-full flex items-center justify-center font-medium">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
};

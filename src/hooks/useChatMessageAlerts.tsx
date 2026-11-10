import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  subscribeToChatNotifications,
  unsubscribeChatNotifications,
} from "@/lib/pushNotifications";

export function useChatMessageAlerts() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    let subscribedUserId = "";

    const connect = (userId: string) => {
      if (!active || userId === subscribedUserId) return;
      subscribedUserId = userId;
      unsubscribeChatNotifications();
      if (!userId) return;

      subscribeToChatNotifications(userId, (senderName, text, senderId) => {
        toast({
          title: `💬 ${senderName}`,
          description: text,
          action: (
            <ToastAction
              altText="Open message conversation"
              onClick={() => navigate(senderId ? `/chat/${encodeURIComponent(senderId)}` : "/chat")}
            >
              Open
            </ToastAction>
          ),
        });
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      connect(session?.user.id || "");
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!error) connect(data.session?.user.id || "");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      unsubscribeChatNotifications();
    };
  }, [navigate, toast]);
}

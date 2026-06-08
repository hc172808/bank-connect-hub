import { useState, useEffect, useCallback } from "react";
import {
  isPushSupported,
  getPermission,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
  saveSubscription,
  deleteSubscription,
} from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";

export type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "unsubscribed";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("unsubscribed");
  const [loading, setLoading] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  // Resolve current state on mount
  useEffect(() => {
    if (!isPushSupported()) { setState("unsupported"); return; }

    const perm = getPermission();
    if (perm === "denied") { setState("denied"); return; }

    getCurrentSubscription().then((sub) => {
      if (sub) { setState("subscribed"); setEndpoint(sub.endpoint); }
      else setState(perm === "granted" ? "unsubscribed" : "prompt");
    });
  }, []);

  const enable = useCallback(async () => {
    if (!isPushSupported()) return;
    setLoading(true);
    try {
      const perm = await requestPermission();
      if (perm !== "granted") { setState("denied"); return; }

      const sub = await subscribeToPush();
      if (!sub) { setState("unsubscribed"); return; }

      setEndpoint(sub.endpoint);
      setState("subscribed");

      // Get current user and save subscription
      const { data: { user } } = await supabase.auth.getUser();
      await saveSubscription(sub, user?.id);
    } finally {
      setLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setLoading(true);
    try {
      if (endpoint) await deleteSubscription(endpoint);
      await unsubscribeFromPush();
      setState(getPermission() === "granted" ? "unsubscribed" : "prompt");
      setEndpoint(null);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  return { state, loading, enable, disable, isSupported: isPushSupported() };
}

import { useEffect } from "react";
import {
  isPushSupported,
  getPermission,
  getCurrentSubscription,
  subscribeToPush,
  saveSubscription,
} from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";

/**
 * Silently re-subscribe to push notifications after login if:
 *  - Push is supported and permission is already "granted"
 *  - The user doesn't already have an active subscription
 *
 * We never prompt here — prompting happens in Security Settings.
 */
export function useAutoPushSubscribe(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    if (!isPushSupported()) return;
    if (getPermission() !== "granted") return;

    let cancelled = false;

    (async () => {
      try {
        const existing = await getCurrentSubscription();
        if (cancelled) return;

        if (!existing) {
          const sub = await subscribeToPush();
          if (sub && !cancelled) {
            await saveSubscription(sub, userId);
          }
        } else {
          await saveSubscription(existing, userId);
        }
      } catch {
        // Silent — never interrupt the user experience for push setup
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);
}

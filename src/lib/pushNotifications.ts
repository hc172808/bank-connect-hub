/**
 * Web Push Notification utilities.
 *
 * Flow:
 *  1. requestPermission()   — ask user for permission
 *  2. subscribe()           — register with push service, get subscription
 *  3. saveSubscription()    — POST subscription to /api/push/subscribe
 *  4. Server sends push via web-push + VAPID
 *  5. sw.js shows the notification
 */
import { supabase } from "@/integrations/supabase/client";

/** Fetch the server's VAPID public key (needed to create a subscription). */
export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const r = await fetch("/api/push/vapid-public-key");
    if (!r.ok) return null;
    const { publicKey } = await r.json();
    return publicKey || null;
  } catch {
    return null;
  }
}

/** Return true if this browser supports Web Push and a SW is registered. */
export function isPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Current notification permission state. */
export function getPermission(): NotificationPermission {
  return "Notification" in window ? Notification.permission : "denied";
}

/** Ask the user for push notification permission. Returns the new state. */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.requestPermission();
}

/**
 * Create (or return existing) push subscription for this device.
 * Returns null if push is not supported or permission is denied.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  const sw = await navigator.serviceWorker.ready;
  const existing = await sw.pushManager.getSubscription();
  if (existing) return existing;

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return null;

  try {
    return await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch {
    return null;
  }
}

/** Unsubscribe from push notifications on this device. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const sw = await navigator.serviceWorker.ready;
    const sub = await sw.pushManager.getSubscription();
    if (!sub) return true;
    return sub.unsubscribe();
  } catch {
    return false;
  }
}

/** Get current subscription (null if not subscribed). */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const sw = await navigator.serviceWorker.ready;
    return sw.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** POST the subscription to the build-server so it can send pushes. */
export async function saveSubscription(sub: PushSubscription, userId?: string): Promise<boolean> {
  try {
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), userId }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** DELETE subscription from server. */
export async function deleteSubscription(endpoint: string): Promise<boolean> {
  try {
    const r = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Realtime (Supabase) notifications ────────────────────────────────────────

let _realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showBrowserNotification(title: string, body: string, icon = "/favicon.ico") {
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 8000);
  } catch (e) {
    console.warn("Notification error:", e);
  }
}

export function subscribeToTransactionNotifications(
  userId: string,
  onNotify?: (title: string, body: string) => void
) {
  if (_realtimeChannel) { supabase.removeChannel(_realtimeChannel); _realtimeChannel = null; }

  _realtimeChannel = supabase
    .channel(`push-notif-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions", filter: `receiver_id=eq.${userId}` }, (payload: any) => {
      const tx = payload.new;
      const amt = Number(tx.amount || 0).toFixed(2);
      const title = "💸 Money Received";
      const body = `You received $${amt}${tx.description ? ` — ${tx.description}` : ""}`;
      showBrowserNotification(title, body);
      onNotify?.(title, body);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "transactions", filter: `receiver_id=eq.${userId}` }, (payload: any) => {
      const tx = payload.new;
      if (tx.status === "completed" && payload.old?.status !== "completed") {
        const amt = Number(tx.amount || 0).toFixed(2);
        const title = "✅ Payment Confirmed";
        const body = `$${amt} payment confirmed`;
        showBrowserNotification(title, body);
        onNotify?.(title, body);
      } else if (tx.status === "reversed") {
        const amt = Number(tx.amount || 0).toFixed(2);
        const title = "↩️ Payment Reversed";
        const body = `$${amt} reversed to your wallet`;
        showBrowserNotification(title, body);
        onNotify?.(title, body);
      }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "fund_requests", filter: `recipient_id=eq.${userId}` }, (payload: any) => {
      const req = payload.new;
      const amt = Number(req.amount || 0).toFixed(2);
      const title = "🙏 Fund Request";
      const body = `Someone requested $${amt} from you${req.note ? ` — ${req.note}` : ""}`;
      showBrowserNotification(title, body);
      onNotify?.(title, body);
    })
    .subscribe();
}

export function unsubscribeTransactionNotifications() {
  if (_realtimeChannel) { supabase.removeChannel(_realtimeChannel); _realtimeChannel = null; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

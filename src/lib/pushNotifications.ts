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

// ── Helpers ──────────────────────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

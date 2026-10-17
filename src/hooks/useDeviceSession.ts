import { supabase } from "@/integrations/supabase/client";

const DEVICE_ID_KEY = "vbank_device_id";
export const PENDING_LOGIN_APPROVAL_KEY = "vbank_pending_login_approval";

const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let inMemoryDeviceId: string | null = null;

function isValidDeviceId(value: string | null): value is string {
  return Boolean(value && DEVICE_ID_PATTERN.test(value));
}

function readStoredDeviceId(storageName: "localStorage" | "sessionStorage"): string | null {
  try {
    const value = globalThis[storageName]?.getItem(DEVICE_ID_KEY) ?? null;
    return isValidDeviceId(value) ? value : null;
  } catch {
    return null;
  }
}

function storeDeviceId(storageName: "localStorage" | "sessionStorage", deviceId: string) {
  try {
    globalThis[storageName]?.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // Keep the ID in memory if browser storage is unavailable.
  }
}

function createDeviceId(): string {
  const secureCrypto = globalThis.crypto;
  if (typeof secureCrypto?.randomUUID === "function") {
    const id = secureCrypto.randomUUID();
    if (isValidDeviceId(id)) return id;
  }

  if (typeof secureCrypto?.getRandomValues === "function") {
    const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error("Secure device ID generation is unavailable in this browser.");
}

export function getOrCreateDeviceId(): string {
  if (isValidDeviceId(inMemoryDeviceId)) return inMemoryDeviceId;

  const localId = readStoredDeviceId("localStorage");
  if (localId) {
    inMemoryDeviceId = localId;
    return localId;
  }

  const sessionId = readStoredDeviceId("sessionStorage");
  if (sessionId) {
    inMemoryDeviceId = sessionId;
    storeDeviceId("localStorage", sessionId);
    return sessionId;
  }

  const id = createDeviceId();
  inMemoryDeviceId = id;
  storeDeviceId("localStorage", id);
  storeDeviceId("sessionStorage", id);
  return id;
}

export function getDeviceInfo() {
  const userAgent = navigator.userAgent;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "Unknown";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  return {
    deviceId: getOrCreateDeviceId(),
    deviceName: isMobile ? "Mobile device" : "Computer",
    browser,
    os,
  };
}

async function legacyDeviceCheck() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return "no_session" as const;
  if (user.user_metadata?.device_login_approval_enabled !== true) return "valid" as const;
  const activeDeviceId = String(user.user_metadata?.active_device_id || "");
  return !activeDeviceId || activeDeviceId === getOrCreateDeviceId()
    ? "valid" as const
    : "displaced" as const;
}

/**
 * Register or activate the current device through the server. An approval
 * token is kept in sessionStorage until this call succeeds so a refresh during
 * the hand-off cannot accidentally release an unapproved session.
 */
export async function claimDeviceSession(accessToken?: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = accessToken || session?.access_token;
    if (!token) return false;
    const approvalToken = sessionStorage.getItem(PENDING_LOGIN_APPROVAL_KEY) || "";
    const response = await fetch("/api/auth/device-session/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...getDeviceInfo(), approvalToken }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) {
      if (approvalToken && [403, 409, 410].includes(response.status)) {
        sessionStorage.removeItem(PENDING_LOGIN_APPROVAL_KEY);
      }
      return false;
    }

    if (result.sessionId) {
      const userId = session?.user.id || (await supabase.auth.getUser()).data.user?.id;
      if (userId) localStorage.setItem(`device_session_${userId}`, result.sessionId);
    }
    if (approvalToken) sessionStorage.removeItem(PENDING_LOGIN_APPROVAL_KEY);

    if (result.legacyFallback) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      if (user.user_metadata?.device_login_approval_enabled !== true) return true;
      const activeDeviceId = String(user.user_metadata?.active_device_id || "");
      if (activeDeviceId && activeDeviceId !== getOrCreateDeviceId()) return false;
      if (!activeDeviceId) {
        const { error } = await supabase.auth.updateUser({
          data: { active_device_id: getOrCreateDeviceId() },
        });
        if (error) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps the device-session row fresh. The legacy metadata check is used only
 * until the additive Supabase migration is installed.
 */
export async function checkDeviceSession(): Promise<"valid" | "displaced" | "no_session"> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return "no_session";
    const response = await fetch("/api/auth/device-session/check", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(getDeviceInfo()),
    });
    if (response.status === 401) return "no_session";
    if (!response.ok) return "valid";
    const result = await response.json().catch(() => ({}));
    if (result.legacyFallback) return legacyDeviceCheck();
    return result.valid === true ? "valid" : "displaced";
  } catch {
    return "valid"; // A temporary network outage must not sign out a valid session.
  }
}

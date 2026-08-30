import { supabase } from "@/integrations/supabase/client";

// WhatsApp verification helpers (click-to-WhatsApp mode).
// No paid API required: we generate a code, open wa.me with it pre-filled,
// and the user sends it to your support line for human/automated verification.

export let WHATSAPP_SUPPORT_NUMBER = "+15555555555";
fetch("/api/config").then(r => r.json()).then((cfg: { whatsappNumber?: string }) => {
  if (cfg.whatsappNumber) WHATSAPP_SUPPORT_NUMBER = cfg.whatsappNumber;
}).catch(() => {});

const STORAGE_KEY = "vb.whatsappVerification";

export interface WhatsAppSettings {
  enabled: boolean;
  supportNumber: string;
  businessName: string;
  instructions: string;
}

const DEFAULT_SETTINGS: WhatsAppSettings = {
  enabled: true,
  supportNumber: "",
  businessName: "NETLIFE CASH Support",
  instructions: "Send the pre-filled message exactly as shown. Never share your password, PIN, or one-time code with anyone outside the official support chat.",
};

const readSetting = (value: unknown, fallback: string): string => {
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "value" in value) return String((value as { value: unknown }).value);
  return fallback;
};

export const fetchWhatsAppSettings = async (): Promise<WhatsAppSettings> => {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const { data, error } = await (supabase as any)
      .from("app_settings")
      .select("key, value")
      .in("key", [
        "whatsapp_verification_enabled",
        "whatsapp_support_number",
        "whatsapp_business_name",
        "whatsapp_verification_instructions",
      ]);
    if (!error) {
      for (const row of (data || []) as Array<{ key: string; value: unknown }>) {
        if (row.key === "whatsapp_verification_enabled") settings.enabled = readSetting(row.value, "true") !== "false";
        if (row.key === "whatsapp_support_number") settings.supportNumber = readSetting(row.value, "");
        if (row.key === "whatsapp_business_name") settings.businessName = readSetting(row.value, settings.businessName);
        if (row.key === "whatsapp_verification_instructions") settings.instructions = readSetting(row.value, settings.instructions);
      }
    }
  } catch {
    // The app-config endpoint remains a safe fallback before migrations are applied.
  }
  if (!settings.supportNumber) settings.supportNumber = WHATSAPP_SUPPORT_NUMBER;
  if (settings.supportNumber) WHATSAPP_SUPPORT_NUMBER = settings.supportNumber;
  return settings;
};

export interface WhatsAppVerification {
  userId: string;
  phone: string;
  code: string;
  sentAt: number; // epoch ms
  confirmedAt?: number;
}

export interface WhatsAppVerificationRequest {
  id: string;
  user_id: string;
  phone_number: string;
  verification_code: string;
  status: "pending" | "verified" | "rejected";
  admin_notes: string | null;
  requested_at: string;
  sent_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  profile?: { full_name: string | null; phone_number: string | null };
}

export const createWhatsAppVerificationRequest = async ({
  userId,
  phoneNumber,
  code,
}: {
  userId: string;
  phoneNumber: string;
  code: string;
}) => {
  const { data, error } = await (supabase as any)
    .from("whatsapp_verification_requests")
    .insert({
      user_id: userId,
      phone_number: phoneNumber,
      verification_code: code,
      status: "pending",
      sent_at: new Date().toISOString(),
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as WhatsAppVerificationRequest;
};

export const getLatestWhatsAppVerificationRequest = async (userId: string) => {
  const { data, error } = await (supabase as any)
    .from("whatsapp_verification_requests")
    .select("*")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as WhatsAppVerificationRequest | null;
};

export const generateVerificationCode = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const buildWhatsAppLink = (phone: string, message: string): string => {
  const cleanPhone = (phone || WHATSAPP_SUPPORT_NUMBER).replace(/[^\d]/g, "");
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
};

export const saveVerification = (v: WhatsAppVerification): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // ignore (private mode, etc.)
  }
};

export const getVerification = (
  userId: string
): WhatsAppVerification | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as WhatsAppVerification;
    return v.userId === userId ? v : null;
  } catch {
    return null;
  }
};

export const isVerified = (userId: string): boolean => {
  const v = getVerification(userId);
  return !!v?.confirmedAt;
};

export const clearVerification = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};

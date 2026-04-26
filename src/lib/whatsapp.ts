// WhatsApp verification helpers (click-to-WhatsApp mode).
// No paid API required: we generate a code, open wa.me with it pre-filled,
// and the user sends it to your support line for human/automated verification.

export const WHATSAPP_SUPPORT_NUMBER =
  (import.meta.env.VITE_WHATSAPP_SUPPORT_NUMBER as string | undefined) ||
  "+15555555555"; // Replace via VITE_WHATSAPP_SUPPORT_NUMBER or admin settings.

const STORAGE_KEY = "vb.whatsappVerification";

export interface WhatsAppVerification {
  userId: string;
  phone: string;
  code: string;
  sentAt: number; // epoch ms
  confirmedAt?: number;
}

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

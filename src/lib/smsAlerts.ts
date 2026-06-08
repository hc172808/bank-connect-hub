// SMS alert utility — calls build-server → Twilio
// Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER on the server.

export type SmsAlertType =
  | "sent"
  | "received"
  | "request"
  | "topup"
  | "login"
  | "kyc"
  | "reversal"
  | "otp";

export interface TransactionSmsParams {
  to: string;
  type: SmsAlertType;
  amount?: number;
  from_name?: string;
  to_name?: string;
  balance?: number;
  reference?: string;
  otp?: string;
}

/**
 * Fire-and-forget SMS alert.
 * Never throws — SMS failure must not break the UI flow.
 */
export async function sendTransactionSms(params: TransactionSmsParams): Promise<void> {
  try {
    await fetch("/api/sms/transaction-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    // intentionally silent — SMS is non-critical
  }
}

/**
 * Send a raw SMS (admin use).
 */
export async function sendRawSms(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
    });
    return res.json();
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Check whether the server has Twilio configured.
 */
export async function isSmsConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/sms/status");
    if (!res.ok) return false;
    const data = await res.json();
    return data.configured === true;
  } catch {
    return false;
  }
}

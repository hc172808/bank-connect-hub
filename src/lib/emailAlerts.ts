// Email alert utility — calls build-server → SMTP (nodemailer)
// Requires SMTP_HOST, SMTP_USER, SMTP_PASS on the server.

export type EmailAlertType =
  | "sent"
  | "received"
  | "request"
  | "topup"
  | "login"
  | "kyc"
  | "reversal"
  | "welcome"
  | "password_change";

export interface TransactionEmailParams {
  to: string;
  type: EmailAlertType;
  amount?: number;
  from_name?: string;
  to_name?: string;
  balance?: number;
  reference?: string;
  date?: string;
}

/**
 * Fire-and-forget email alert.
 * Never throws — email failure must not break the UI flow.
 */
export async function sendTransactionEmail(params: TransactionEmailParams): Promise<void> {
  try {
    await fetch("/api/email/transaction-alert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    // intentionally silent
  }
}

/**
 * Check whether the server has SMTP configured.
 */
export async function isEmailConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/email/status");
    if (!res.ok) return false;
    const data = await res.json();
    return data.configured === true;
  } catch {
    return false;
  }
}

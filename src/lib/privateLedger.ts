import { supabase } from "@/integrations/supabase/client";

export interface PrivateLedgerTransferInput {
  senderId: string;
  receiverId: string;
  amount: number;
  transactionType: string;
  description?: string;
}

export interface PrivateLedgerTransferResult {
  success: boolean;
  transaction_id?: string;
  error?: string;
  fee?: number;
  sender_cashback?: number;
  liquidity_pool_fee?: number;
}

const PENDING_TRANSFER_KEYS = "nlc_private_transfer_keys_v1";
const MAX_PENDING_TRANSFER_KEYS = 200;

type StoredTransferKey = {
  fingerprint: string;
  id: string;
  createdAt: number;
};

function createIdempotencyKey(): string {
  if (typeof crypto === "undefined") {
    throw new Error("Secure transfer protection is unavailable in this browser.");
  }
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function readStoredTransferKeys(): StoredTransferKey[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_TRANSFER_KEYS) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) =>
      entry &&
      typeof entry.fingerprint === "string" &&
      typeof entry.id === "string" &&
      typeof entry.createdAt === "number"
    ) : [];
  } catch {
    return [];
  }
}

function writeStoredTransferKeys(entries: StoredTransferKey[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(PENDING_TRANSFER_KEYS, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function getIdempotencyKey(input: PrivateLedgerTransferInput): { fingerprint: string; id: string } {
  const fingerprint = JSON.stringify([
    input.senderId,
    input.receiverId,
    input.amount,
    input.transactionType,
    input.description ?? "",
  ]);
  const now = Date.now();
  const stored = readStoredTransferKeys();
  const storedValue = stored.find((entry) => entry.fingerprint === fingerprint);
  if (storedValue) {
    return { fingerprint, id: storedValue.id };
  }

  if (stored.length >= MAX_PENDING_TRANSFER_KEYS) {
    throw new Error("There are too many unresolved transfer attempts in this browser. Contact support before sending again.");
  }

  const id = createIdempotencyKey();
  const createdAt = now;
  const next = [...stored, { fingerprint, id, createdAt }];
  if (!writeStoredTransferKeys(next)) {
    throw new Error("Secure transfer protection requires browser storage to be enabled.");
  }
  return { fingerprint, id };
}

function clearIdempotencyKey(fingerprint: string) {
  writeStoredTransferKeys(readStoredTransferKeys().filter((entry) => entry.fingerprint !== fingerprint));
}

/**
 * The app's financial rail.
 *
 * Transfers are committed atomically by the database function. The client
 * supplies intent only; balances, fees, timestamps, and transaction IDs are
 * owned by the database transaction.
 */
export async function processPrivateLedgerTransfer(
  input: PrivateLedgerTransferInput,
): Promise<PrivateLedgerTransferResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { success: false, error: "Enter a valid amount." };
  }
  if (!input.senderId || !input.receiverId) {
    return { success: false, error: "A sender and recipient are required." };
  }
  if (input.senderId === input.receiverId) {
    return { success: false, error: "You cannot transfer money to yourself." };
  }

  let request: { fingerprint: string; id: string };
  try {
    request = getIdempotencyKey(input);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Secure transfer protection is unavailable." };
  }

  const { data, error } = await supabase.rpc("process_private_ledger_transfer_v2", {
    _receiver_id: input.receiverId,
    _amount: input.amount,
    _transaction_type: input.transactionType,
    _idempotency_key: request.id,
    _description: input.description,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = (data || {}) as unknown as PrivateLedgerTransferResult;
  // A definite database response is safe to retry with a new request ID.
  // Transport errors above keep the ID because the transfer may have committed.
  clearIdempotencyKey(request.fingerprint);
  return result.success ? result : { ...result, error: result.error || "The ledger rejected this transfer." };
}
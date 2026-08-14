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

  const { data, error } = await supabase.rpc("process_private_ledger_transfer", {
    _receiver_id: input.receiverId,
    _amount: input.amount,
    _transaction_type: input.transactionType,
    _description: input.description,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = (data || {}) as PrivateLedgerTransferResult;
  return result.success
    ? result
    : { ...result, error: result.error || "The ledger rejected this transfer." };
}
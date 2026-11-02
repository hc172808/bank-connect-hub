import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Compatibility boundary for deployments where the reversal migration is
// managed separately. Never bypass server authorization or simulate success.
type ReversalRequest =
  | { name: "request_fund_reversal"; args: { _transaction_id: string; _reason: string | null } }
  | { name: "reject_fund_reversal"; args: { _reversal_id: string } };

export async function callReversalRpc(request: ReversalRequest) {
  const client: SupabaseClient = supabase;
  const result = await client.rpc(request.name, request.args);
  if (result.error?.code === "PGRST202" || result.error?.code === "42883") {
    throw new Error("Fund reversals are unavailable because the required database update has not been installed. No funds were moved.");
  }
  return result;
}
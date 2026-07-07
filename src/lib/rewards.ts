import { supabase } from "@/integrations/supabase/client";

export const REWARDS_KEY = "vbank_rewards_v1";
export const REWARDS_CONFIG_KEY = "vbank_rewards_config_v1";

export interface RewardsConfig {
  enabled: boolean;
  pointsPerDollar: number;    // default 2 pts per $1
  cashbackPctPerPoint: number; // default 0.005 ($0.005 per point = 0.5% base)
  minRedemption: number;      // minimum $ cashback to redeem
}

export interface PointActivity {
  id: string;
  date: string;
  description: string;
  points: number;
  cashback: number;
  type: "earned" | "redeemed" | "bonus";
}

export interface RewardsData {
  points: number;
  cashback: number;
  totalEarned: number;
  totalRedeemed: number;
  activities: PointActivity[];
}

export function getRewardsConfig(): RewardsConfig {
  try {
    const raw = localStorage.getItem(REWARDS_CONFIG_KEY);
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {}
  return defaultConfig();
}

function defaultConfig(): RewardsConfig {
  return {
    enabled: true,
    pointsPerDollar: 2,
    cashbackPctPerPoint: 0.005,
    minRedemption: 1.0,
  };
}

export function saveRewardsConfig(config: RewardsConfig) {
  try { localStorage.setItem(REWARDS_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

export function getRewardsData(userId: string): RewardsData {
  try {
    const raw = localStorage.getItem(`${REWARDS_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { points: 0, cashback: 0, totalEarned: 0, totalRedeemed: 0, activities: [] };
}

function saveRewardsData(userId: string, data: RewardsData) {
  try { localStorage.setItem(`${REWARDS_KEY}_${userId}`, JSON.stringify(data)); } catch {}
}

/**
 * Award points to a user for a transaction.
 * Call this after any successful transaction (transfer, bill pay, QR payment, etc.)
 */
export function awardPoints(
  userId: string,
  transactionAmount: number,
  description: string,
  type: "earned" | "bonus" = "earned",
) {
  const config = getRewardsConfig();
  if (!config.enabled) return;

  const pts = type === "bonus"
    ? transactionAmount  // bonus: amount IS the points
    : Math.floor(transactionAmount * config.pointsPerDollar);

  const cb = parseFloat((pts * config.cashbackPctPerPoint).toFixed(4));

  const data = getRewardsData(userId);
  const activity: PointActivity = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    description,
    points: pts,
    cashback: cb,
    type,
  };

  const updated: RewardsData = {
    points: data.points + pts,
    cashback: parseFloat((data.cashback + cb).toFixed(4)),
    totalEarned: data.totalEarned + pts,
    totalRedeemed: data.totalRedeemed,
    activities: [activity, ...data.activities].slice(0, 100),
  };

  saveRewardsData(userId, updated);
  return updated;
}

/**
 * Redeem cashback balance — credits the user's wallet via Supabase.
 * Returns { success, error, amount }
 */
export async function redeemCashback(userId: string): Promise<{ success: boolean; amount?: number; error?: string }> {
  const config = getRewardsConfig();
  const data = getRewardsData(userId);

  if (data.cashback < config.minRedemption) {
    return { success: false, error: `Minimum $${config.minRedemption.toFixed(2)} required to redeem.` };
  }

  const amount = parseFloat(data.cashback.toFixed(2));

  try {
    // Fetch current wallet balance
    const { data: wallet, error: fetchErr } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", userId)
      .single();

    if (fetchErr || !wallet) return { success: false, error: "Could not find your wallet." };

    // Credit the wallet
    const { error: updateErr } = await supabase
      .from("wallets")
      .update({ balance: wallet.balance + amount, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);

    if (updateErr) return { success: false, error: updateErr.message };

    // Log a transaction record
    await supabase.from("transactions").insert({
      sender_id: userId,
      receiver_id: userId,
      amount,
      transaction_type: "cashback_redemption",
      status: "completed",
      description: `Cashback redeemed: $${amount.toFixed(2)}`,
      fee: 0,
    }).throwOnError();

    // Update local state
    const activity: PointActivity = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      description: `Cashback redeemed: $${amount.toFixed(2)}`,
      points: 0,
      cashback: -amount,
      type: "redeemed",
    };

    const updated: RewardsData = {
      ...data,
      cashback: 0,
      totalRedeemed: parseFloat((data.totalRedeemed + amount).toFixed(2)),
      activities: [activity, ...data.activities].slice(0, 100),
    };
    saveRewardsData(userId, updated);

    return { success: true, amount };
  } catch (err: any) {
    return { success: false, error: err.message || "Redemption failed" };
  }
}

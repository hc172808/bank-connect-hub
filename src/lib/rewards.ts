import { supabase } from "@/integrations/supabase/client";

export const REWARDS_KEY = "vbank_rewards_v1";
export const REFERRAL_CODE_KEY = "vbank_pending_referral";
export const REFERRAL_REWARDED_KEY = "vbank_referral_rewarded";
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

// ── Referral Rewards ──────────────────────────────────────────────────────────

/** Store the referral code a new user entered during sign-up (before their account exists) */
export function storeUsedReferralCode(code: string) {
  try { localStorage.setItem(REFERRAL_CODE_KEY, code.trim().toUpperCase()); } catch {}
}

export function getUsedReferralCode(): string | null {
  try { return localStorage.getItem(REFERRAL_CODE_KEY); } catch { return null; }
}

export function clearUsedReferralCode() {
  try { localStorage.removeItem(REFERRAL_CODE_KEY); } catch {}
}

/**
 * Call this after the new user's FIRST successful transaction.
 * Finds the referrer by code, awards 200 pts to referrer + 100 pts to new user,
 * and increments referrer's referral_count in Supabase profiles.
 */
export async function processReferralReward(newUserId: string): Promise<boolean> {
  const code = getUsedReferralCode();
  if (!code) return false;

  const alreadyRewarded = localStorage.getItem(`${REFERRAL_REWARDED_KEY}_${newUserId}`);
  if (alreadyRewarded) return false;

  try {
    // Find the referrer whose UUID starts with the code (case-insensitive)
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .ilike("id", `${code.toLowerCase()}%`)
      .single();

    if (error || !data || data.id === newUserId) return false;

    const referrerId = data.id;

    // Award points to referrer
    awardPoints(referrerId, 200, "Referral bonus 👥 — friend made first transaction", "bonus");

    // Award points to new user
    awardPoints(newUserId, 100, "Welcome referral bonus 🎁 — joined via referral", "bonus");

    // Increment referral_count in profiles for referrer
    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_count")
      .eq("id", referrerId)
      .single();

    await supabase
      .from("profiles")
      .update({ referral_count: ((profile as any)?.referral_count || 0) + 1 })
      .eq("id", referrerId);

    // Mark this user as having had their referral processed
    localStorage.setItem(`${REFERRAL_REWARDED_KEY}_${newUserId}`, "1");
    clearUsedReferralCode();

    return true;
  } catch {
    return false;
  }
}

/** Get how many points this user has earned purely from referral bonuses */
export function getReferralPointsEarned(userId: string): number {
  const data = getRewardsData(userId);
  return data.activities
    .filter(a => a.description.includes("Referral bonus") || a.description.includes("referral"))
    .reduce((sum, a) => sum + a.points, 0);
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

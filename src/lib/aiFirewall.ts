// ── AI Firewall — real-time pre-transaction gate ──────────────────────────────
//
// Called BEFORE any transfer is submitted.  Returns a decision with a risk
// score and human-readable reason.  Admin rules are stored in Supabase
// `app_settings` (key = "firewall_rules") so they survive page reloads and
// apply across all sessions instantly.
//
// The admin page (AdminFirewall.tsx) writes/reads this key.

import { supabase } from "@/integrations/supabase/client";
import { loadAISettings } from "./aiSecurity";

export type FirewallRisk = "low" | "medium" | "high" | "critical";

export interface FirewallResult {
  blocked: boolean;
  reason: string;
  score: number;       // 0–100
  level: FirewallRisk;
  ruleHit: string;     // which rule triggered the block/flag
}

export interface FirewallRules {
  enabled: boolean;
  blockOnCritical: boolean;      // auto-block when score >= critical threshold
  blockOnHigh: boolean;          // auto-block when score >= high threshold
  maxSingleAmount: number;       // block single tx over this amount
  maxDailyAmount: number;        // block if user's 24h total exceeds this
  maxTxPerHour: number;          // velocity: block > N tx in 60 min
  blockedHoursStart: number;     // 0-23: block transactions from this hour
  blockedHoursEnd: number;       // 0-23: to this hour (00 = disabled)
  blockedAddresses: string[];    // wallet addresses / user IDs to always block
  blockedKeywords: string[];     // description keywords that are suspicious
  requireNoteAbove: number;      // require a description for amounts above this
  minAmount: number;             // block amounts below this (dust attack guard)
  structuringThreshold: number;  // flag if amount is just below a round number
  lastUpdated: number;
}

export const DEFAULT_FIREWALL_RULES: FirewallRules = {
  enabled: true,
  blockOnCritical: true,
  blockOnHigh: false,
  maxSingleAmount: 50000,
  maxDailyAmount: 100000,
  maxTxPerHour: 20,
  blockedHoursStart: 0,
  blockedHoursEnd: 0,   // 0 = disabled
  blockedAddresses: [],
  blockedKeywords: [],
  requireNoteAbove: 0,  // 0 = disabled
  minAmount: 0.01,
  structuringThreshold: 0, // 0 = disabled
  lastUpdated: Date.now(),
};

const CACHE_KEY = "vb.firewall.rules";
const CACHE_TTL = 30_000; // 30 s — refresh from Supabase every 30 s
let _cachedAt = 0;
let _cached: FirewallRules | null = null;

// ── Load rules (Supabase primary, localStorage fallback) ─────────────────────

export async function loadFirewallRules(): Promise<FirewallRules> {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL) return _cached;

  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "firewall_rules")
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === "string"
        ? JSON.parse(data.value)
        : data.value;
      const rules: FirewallRules = { ...DEFAULT_FIREWALL_RULES, ...parsed };
      _cached = rules;
      _cachedAt = now;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(rules)); } catch {}
      return rules;
    }
  } catch {}

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _cached = { ...DEFAULT_FIREWALL_RULES, ...parsed };
      _cachedAt = now;
      return _cached;
    }
  } catch {}

  return DEFAULT_FIREWALL_RULES;
}

export async function saveFirewallRules(rules: FirewallRules): Promise<void> {
  _cached = rules;
  _cachedAt = Date.now();
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rules)); } catch {}

  await supabase.from("app_settings").upsert(
    { key: "firewall_rules", value: JSON.stringify(rules) },
    { onConflict: "key" }
  );
}

export function loadFirewallRulesSync(): FirewallRules {
  if (_cached) return _cached;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_FIREWALL_RULES, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_FIREWALL_RULES;
}

// ── Recent transaction cache (for velocity / daily-volume checks) ─────────────

interface TxSummary {
  amount: number;
  created_at: string;
  sender_id: string;
}
let _recentTx: TxSummary[] = [];
let _txFetchedAt = 0;

async function getRecentTx(senderId: string): Promise<TxSummary[]> {
  const now = Date.now();
  if (_recentTx.length > 0 && now - _txFetchedAt < 60_000) {
    return _recentTx.filter(t => t.sender_id === senderId);
  }
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("transactions")
    .select("amount, created_at, sender_id")
    .eq("sender_id", senderId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (data) {
    _recentTx = data;
    _txFetchedAt = now;
  }
  return (_recentTx || []).filter(t => t.sender_id === senderId);
}

// ── Score ─────────────────────────────────────────────────────────────────────

function scoreFromLevel(level: FirewallRisk): number {
  return level === "critical" ? 90 : level === "high" ? 70 : level === "medium" ? 40 : 15;
}

function levelFromScore(score: number): FirewallRisk {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

// ── Main firewall check ───────────────────────────────────────────────────────

export interface PendingTx {
  senderId: string;
  receiverId?: string;        // internal transfer
  toAddress?: string;         // blockchain transfer
  amount: number;
  description?: string;
  txType: "internal" | "blockchain";
}

export async function checkFirewall(tx: PendingTx): Promise<FirewallResult> {
  const rules = await loadFirewallRules();

  if (!rules.enabled) {
    return { blocked: false, reason: "Firewall disabled", score: 0, level: "low", ruleHit: "none" };
  }

  let score = 0;
  let topReason = "Transaction looks clean";
  let topRule = "none";

  const reasons: Array<{ score: number; reason: string; rule: string; hard?: boolean }> = [];

  // ── Hard blocks (blocked addresses, keywords) ─────────────────────────────
  const blockedMatch = rules.blockedAddresses.find(
    b => b === tx.receiverId || b === tx.toAddress || b === tx.senderId
  );
  if (blockedMatch) {
    reasons.push({ score: 100, reason: `Address/user is on the blocked list`, rule: "blocked_address", hard: true });
  }

  if (tx.description) {
    const kw = rules.blockedKeywords.find(k => tx.description!.toLowerCase().includes(k.toLowerCase()));
    if (kw) {
      reasons.push({ score: 95, reason: `Description contains blocked keyword: "${kw}"`, rule: "blocked_keyword", hard: true });
    }
  }

  // ── Amount rules ──────────────────────────────────────────────────────────
  if (rules.minAmount > 0 && tx.amount < rules.minAmount) {
    reasons.push({ score: 80, reason: `Amount ${tx.amount} is below the minimum allowed (${rules.minAmount})`, rule: "min_amount", hard: true });
  }

  if (tx.amount > rules.maxSingleAmount) {
    reasons.push({ score: 85, reason: `Single transaction amount $${tx.amount.toLocaleString()} exceeds limit of $${rules.maxSingleAmount.toLocaleString()}`, rule: "max_single_amount", hard: true });
  }

  // ── Structuring detection (just below round numbers) ──────────────────────
  if (rules.structuringThreshold > 0) {
    const roundNumbers = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
    const isStructuring = roundNumbers.some(r =>
      tx.amount > rules.structuringThreshold && tx.amount >= r * 0.9 && tx.amount < r
    );
    if (isStructuring) {
      reasons.push({ score: 65, reason: `Amount $${tx.amount} looks like structuring (just below a round number)`, rule: "structuring" });
    }
  }

  // ── Time-based block ──────────────────────────────────────────────────────
  if (rules.blockedHoursStart !== 0 || rules.blockedHoursEnd !== 0) {
    const hour = new Date().getHours();
    const inBlockedWindow = rules.blockedHoursStart <= rules.blockedHoursEnd
      ? hour >= rules.blockedHoursStart && hour < rules.blockedHoursEnd
      : hour >= rules.blockedHoursStart || hour < rules.blockedHoursEnd;
    if (inBlockedWindow) {
      reasons.push({ score: 90, reason: `Transactions are blocked between ${rules.blockedHoursStart}:00 and ${rules.blockedHoursEnd}:00`, rule: "blocked_hours", hard: true });
    }
  }

  // ── Note required ─────────────────────────────────────────────────────────
  if (rules.requireNoteAbove > 0 && tx.amount >= rules.requireNoteAbove && !tx.description?.trim()) {
    reasons.push({ score: 70, reason: `A description is required for transactions above $${rules.requireNoteAbove.toLocaleString()}`, rule: "require_note", hard: true });
  }

  // ── Velocity & daily volume (async) ───────────────────────────────────────
  try {
    const recent = await getRecentTx(tx.senderId);
    const now = Date.now();

    // Daily volume
    const dailyTotal = recent.reduce((s, t) => s + Number(t.amount), 0);
    if (dailyTotal + tx.amount > rules.maxDailyAmount) {
      reasons.push({
        score: 80,
        reason: `Daily volume would reach $${(dailyTotal + tx.amount).toLocaleString()} (limit $${rules.maxDailyAmount.toLocaleString()})`,
        rule: "daily_volume",
        hard: true,
      });
    }

    // Velocity
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
    const lastHourCount = recent.filter(t => t.created_at >= oneHourAgo).length;
    if (lastHourCount >= rules.maxTxPerHour) {
      reasons.push({
        score: 75,
        reason: `Too many transactions: ${lastHourCount} in the last hour (limit ${rules.maxTxPerHour})`,
        rule: "velocity",
        hard: true,
      });
    }

    // Also run existing AI security scoring
    const aiSettings = loadAISettings();
    if (aiSettings.enabled) {
      if (aiSettings.watchlist.includes(tx.senderId) || aiSettings.watchlist.includes(tx.receiverId || "")) {
        reasons.push({ score: 60, reason: "Sender or receiver is on the AI watchlist", rule: "ai_watchlist" });
      }
      if (tx.amount > aiSettings.thresholds.veryLargeAmount) {
        reasons.push({ score: 50, reason: `Amount exceeds AI very-large threshold ($${aiSettings.thresholds.veryLargeAmount.toLocaleString()})`, rule: "ai_very_large" });
      }
    }
  } catch {}

  // ── Compute final score ───────────────────────────────────────────────────
  if (reasons.length === 0) {
    return { blocked: false, reason: topReason, score: 5, level: "low", ruleHit: "none" };
  }

  const sorted = [...reasons].sort((a, b) => b.score - a.score);
  score = Math.min(100, sorted[0].score);
  topReason = sorted[0].reason;
  topRule = sorted[0].rule;
  const level = levelFromScore(score);

  const hardBlock = reasons.some(r => r.hard);
  const blocked =
    hardBlock ||
    (rules.blockOnCritical && level === "critical") ||
    (rules.blockOnHigh && level === "high");

  return { blocked, reason: topReason, score, level, ruleHit: topRule };
}

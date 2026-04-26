// Lightweight, on-device AI-style security risk engine.
// Settings are persisted to localStorage so the admin has full control:
// enable/disable, tune thresholds, override decisions.
//
// All scoring runs client-side over data already loaded for the admin
// (no server changes required). Admins see "would-block" advisories so
// they decide; auto-block can be turned on if the admin wants it.

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AISecuritySettings {
  enabled: boolean;
  autoBlock: boolean; // when true, surfaces "blocked" status for high-risk
  thresholds: {
    largeAmount: number;        // single-tx amount over this is suspicious
    veryLargeAmount: number;    // single-tx amount over this is critical
    dailyVolume: number;        // user's 24h outgoing volume cap (advisory)
    rapidFireCount: number;     // # of tx in rapidFireWindowMin = suspicious
    rapidFireWindowMin: number; // window in minutes
    minRiskToFlag: RiskLevel;   // hide anything below this from the dashboard
  };
  watchlist: string[]; // user IDs always treated as risky
  trustlist: string[]; // user IDs never flagged
  lastUpdated: number;
}

export interface ScoredTransaction {
  id: string;
  amount: number;
  status: string;
  transaction_type: string;
  description: string | null;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  score: number;          // 0..100
  level: RiskLevel;
  reasons: string[];
  wouldBlock: boolean;    // true when autoBlock is on and level === critical
}

const STORAGE_KEY = "vb.aiSecurity.settings";

export const DEFAULT_AI_SETTINGS: AISecuritySettings = {
  enabled: true,
  autoBlock: false,
  thresholds: {
    largeAmount: 1000,
    veryLargeAmount: 5000,
    dailyVolume: 10000,
    rapidFireCount: 5,
    rapidFireWindowMin: 10,
    minRiskToFlag: "medium",
  },
  watchlist: [],
  trustlist: [],
  lastUpdated: Date.now(),
};

export const loadAISettings = (): AISecuritySettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AI_SETTINGS,
      ...parsed,
      thresholds: { ...DEFAULT_AI_SETTINGS.thresholds, ...(parsed.thresholds || {}) },
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      trustlist: Array.isArray(parsed.trustlist) ? parsed.trustlist : [],
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
};

export const saveAISettings = (s: AISecuritySettings): void => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...s, lastUpdated: Date.now() })
    );
  } catch {
    // ignore
  }
};

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const levelFromScore = (score: number): RiskLevel => {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 25) return "medium";
  return "low";
};

interface RawTx {
  id: string;
  amount: number;
  status: string;
  transaction_type: string;
  description: string | null;
  created_at: string;
  sender_id: string;
  receiver_id: string;
}

export const scoreTransactions = (
  txs: RawTx[],
  settings: AISecuritySettings = loadAISettings()
): ScoredTransaction[] => {
  if (!settings.enabled) {
    return txs.map((t) => ({
      ...t,
      score: 0,
      level: "low",
      reasons: ["AI security disabled"],
      wouldBlock: false,
    }));
  }

  // Bucket per-sender 24h totals + recent counts
  const now = Date.now();
  const senderTotals = new Map<string, number>();
  const senderRecent = new Map<string, number[]>(); // timestamps within window
  const rapidFireWindowMs = settings.thresholds.rapidFireWindowMin * 60 * 1000;

  txs.forEach((t) => {
    const ts = new Date(t.created_at).getTime();
    if (now - ts <= 24 * 60 * 60 * 1000) {
      senderTotals.set(t.sender_id, (senderTotals.get(t.sender_id) ?? 0) + Number(t.amount || 0));
    }
    if (now - ts <= rapidFireWindowMs) {
      const arr = senderRecent.get(t.sender_id) ?? [];
      arr.push(ts);
      senderRecent.set(t.sender_id, arr);
    }
  });

  const minRank = RISK_RANK[settings.thresholds.minRiskToFlag];

  return txs
    .map((t) => {
      const reasons: string[] = [];
      let score = 0;

      const amt = Number(t.amount || 0);

      // Trustlist short-circuit
      if (settings.trustlist.includes(t.sender_id) || settings.trustlist.includes(t.receiver_id)) {
        return {
          ...t,
          score: 0,
          level: "low" as RiskLevel,
          reasons: ["Trustlisted party"],
          wouldBlock: false,
        };
      }

      // Watchlist boost
      if (settings.watchlist.includes(t.sender_id) || settings.watchlist.includes(t.receiver_id)) {
        score += 60;
        reasons.push("Watchlisted party");
      }

      // Amount-based
      if (amt >= settings.thresholds.veryLargeAmount) {
        score += 60;
        reasons.push(`Very large amount ($${amt.toFixed(2)})`);
      } else if (amt >= settings.thresholds.largeAmount) {
        score += 30;
        reasons.push(`Large amount ($${amt.toFixed(2)})`);
      }

      // Daily volume
      const dailyTotal = senderTotals.get(t.sender_id) ?? 0;
      if (dailyTotal > settings.thresholds.dailyVolume) {
        score += 25;
        reasons.push(`Daily outflow $${dailyTotal.toFixed(0)} > limit`);
      }

      // Rapid fire
      const recent = senderRecent.get(t.sender_id) ?? [];
      if (recent.length >= settings.thresholds.rapidFireCount) {
        score += 25;
        reasons.push(`${recent.length} txs in ${settings.thresholds.rapidFireWindowMin}m`);
      }

      // Round-number micro-signal (e.g. exactly 1000.00 — common for fraud testing)
      if (amt > 0 && amt % 100 === 0 && amt >= settings.thresholds.largeAmount) {
        score += 5;
        reasons.push("Round-number amount");
      }

      // Off-hours (00:00–05:00 local)
      const hour = new Date(t.created_at).getHours();
      if (hour < 5 && amt >= settings.thresholds.largeAmount / 2) {
        score += 10;
        reasons.push(`Off-hours (${hour.toString().padStart(2, "0")}:00)`);
      }

      // Self-transfer
      if (t.sender_id === t.receiver_id) {
        score += 40;
        reasons.push("Sender = receiver");
      }

      // Failed/reversed
      if (t.status === "failed" || t.status === "reversed") {
        score += 15;
        reasons.push(`Status: ${t.status}`);
      }

      score = Math.min(100, score);
      const level = levelFromScore(score);
      const wouldBlock = settings.autoBlock && level === "critical";

      return { ...t, score, level, reasons, wouldBlock };
    })
    .filter((s) => RISK_RANK[s.level] >= minRank);
};

export const summarizeRisk = (scored: ScoredTransaction[]) => {
  const byLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let blocked = 0;
  scored.forEach((s) => {
    byLevel[s.level] += 1;
    if (s.wouldBlock) blocked += 1;
  });
  return { total: scored.length, byLevel, blocked };
};

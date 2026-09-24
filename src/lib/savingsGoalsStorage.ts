export const SAVINGS_GOALS_STORAGE_KEY = "vbank_savings_goals_v1";
export const LEGACY_SAVINGS_GOALS_STORAGE_KEY = "savings_goals";

export const savingsGoalsStorageKey = (userId: string) =>
  `${SAVINGS_GOALS_STORAGE_KEY}_${userId}`;

export const legacySavingsGoalsStorageKey = (userId: string) =>
  `${LEGACY_SAVINGS_GOALS_STORAGE_KEY}_${userId}`;
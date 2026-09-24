export type FinancialToolTab = "expenses" | "income" | "debt" | "networth";

export const FINANCIAL_TOOL_FEATURES = [
  { featureKey: "financial_tools_expenses", featureName: "Expense Tracking", tab: "expenses" as const },
  { featureKey: "financial_tools_income", featureName: "Income Tracking", tab: "income" as const },
  { featureKey: "financial_tools_debt", featureName: "Debt Tracking", tab: "debt" as const },
  { featureKey: "financial_tools_networth", featureName: "Net Worth", tab: "networth" as const },
] as const;

export const FINANCIAL_TOOL_FEATURE_KEYS = FINANCIAL_TOOL_FEATURES.map(
  ({ featureKey }) => featureKey
);

export const financialToolFeatureKey = (tab: FinancialToolTab) =>
  FINANCIAL_TOOL_FEATURES.find((feature) => feature.tab === tab)?.featureKey;
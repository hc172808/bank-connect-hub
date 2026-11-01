import type { UserRole } from "@/hooks/useAuth";

export function isStaffRole(role: UserRole | null): boolean {
  return role === "admin" || role === "founder" || role === "agent";
}

export function staffDashboardPath(role: UserRole | null): string {
  return role === "agent" ? "/agent" : "/admin";
}

// Explicit banking routes keep privileged routes in their original role trees.
const bankingPaths = new Set([
  "/client", "/send-money", "/request-funds", "/my-qr", "/pay-bills", "/top-up",
  "/pay-merchant", "/refer", "/leaderboard", "/transactions", "/menu", "/scan-to-pay",
  "/add-money", "/add-money/card", "/add-money/bank", "/add-money/agent", "/add-money/mobile",
  "/receive-money", "/coin-convert", "/vendor-store", "/vendors", "/request-reversal",
  "/budget", "/savings", "/savings-accounts", "/loans", "/international-transfers",
  "/group-payments", "/credit-builder", "/multi-wallet", "/role-management", "/rewards",
  "/business-banking", "/investments", "/invoicing", "/gamification",
  "/security-operations", "/cards-hub", "/financing", "/support", "/chat",
  "/beneficiaries", "/virtual-cards", "/insights", "/scheduled-payments", "/split-bills",
  "/ai-assistant", "/kyc", "/verify-whatsapp",
]);

export function isBankingPath(path: string): boolean {
  const normalized = path.replace(/\/+$/, "") || "/";
  return bankingPaths.has(normalized) || normalized.startsWith("/chat/");
}

export function canUseBankingView(role: UserRole | null, path: string): boolean {
  return role === "client" || (isStaffRole(role) && isBankingPath(path));
}
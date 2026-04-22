import { useAuth } from "@/hooks/useAuth";

/**
 * Returns the route of the current user's home dashboard.
 * Falls back to /client while role is loading so the app never gets stuck.
 */
export const useDashboardHome = (): string => {
  const { role } = useAuth();
  switch (role) {
    case "vendor":
      return "/vendor";
    case "agent":
      return "/agent";
    case "admin":
      return "/admin";
    case "client":
    default:
      return "/client";
  }
};

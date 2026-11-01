import { ArrowRightLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { isStaffRole, staffDashboardPath } from "@/lib/dashboardViews";

export function DashboardSwitcher({ banking = false, floating = false }: { banking?: boolean; floating?: boolean }) {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  if (loading || !isStaffRole(role)) return null;
  const label = banking ? `${role === "agent" ? "Agent" : role === "founder" ? "Founder" : "Admin"} view` : "Banking view";
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={`Switch to ${label}`}
      title={`Switch to ${label}`}
      onClick={() => navigate(banking ? staffDashboardPath(role) : "/client")}
      className={floating
        ? "dashboard-switch-floating fixed right-4 z-40 gap-2 rounded-full border border-primary/50 bg-card text-primary shadow-card h-11 px-4"
        : "gap-2 border border-primary/30 min-h-10 px-2 sm:px-3 shrink-0"}
    >
      <ArrowRightLeft size={16} />
      <span className={floating ? "" : "hidden sm:inline"}>{label}</span>
    </Button>
  );
}
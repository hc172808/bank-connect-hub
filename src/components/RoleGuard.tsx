import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, UserRole } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Hard route guard. Renders children only when the current user has one of
 * `allow` roles. Otherwise redirects to that user's home dashboard with a toast.
 */
export const RoleGuard = ({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactNode;
}) => {
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (!loading && user && role && !allow.includes(role)) {
      toast.error("Access denied — this page is not available for your account");
    }
  }, [loading, user, role, allow]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!role || !allow.includes(role)) {
    return <Navigate to={role ? `/${role}` : "/auth"} replace />;
  }
  return <>{children}</>;
};

export default RoleGuard;
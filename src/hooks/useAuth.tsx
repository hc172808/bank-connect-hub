import { useState, useEffect, useRef, useCallback } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, initSupabase } from "@/integrations/supabase/client";
import { claimDeviceSession, checkDeviceSession, getOrCreateDeviceId } from "./useDeviceSession";

async function logSessionEvent(
  action: string,
  userId: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const auditLogs = supabase.from("audit_logs") as unknown as {
      insert: (row: Record<string, unknown>) => Promise<unknown>;
    };
    await auditLogs.insert({
      action,
      actor_id: userId,
      entity_type: "session",
      entity_id: userId,
      user_agent: navigator.userAgent.slice(0, 200),
      metadata: {
        device_id: getOrCreateDeviceId(),
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
  } catch {
    // Audit logging is best-effort and never blocks authentication.
  }
}

export type UserRole = "admin" | "founder" | "agent" | "client" | "vendor";

export interface AuthState {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  loading: boolean;
  displacedByDevice: boolean;
}

async function fetchUserRole(userId: string): Promise<UserRole> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(20);

  if (error) {
    console.error("[auth] Could not load the signed-in user's database role:", error.message);
    return "client";
  }

  const validRoles: UserRole[] = ["admin", "founder", "agent", "client", "vendor"];
  const roles = new Set(
    (data ?? [])
      .map((row) => row.role)
      .filter((role): role is UserRole => validRoles.includes(role as UserRole)),
  );

  // Some accounts have more than one role. Resolve deterministically so an
  // additional client role cannot hide the account's staff role.
  for (const role of ["founder", "admin", "agent", "vendor", "client"] as const) {
    if (roles.has(role)) return role;
  }
  return "client";
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    loading: true,
    displacedByDevice: false,
  });

  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSessionRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const processedTokenRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);
  const deviceDeniedRef = useRef(false);

  const stopDeviceCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);

  const doDeviceCheck = useCallback(async () => {
    if (!hasSessionRef.current) return;
    const result = await checkDeviceSession();
    if (result !== "displaced") return;

    stopDeviceCheck();
    deviceDeniedRef.current = true;
    const userId = currentUserIdRef.current;
    if (userId) {
      void logSessionEvent("session.displaced", userId, {
        reason: "This device session was revoked or is no longer approved",
      });
    }
    await supabase.auth.signOut();
    hasSessionRef.current = false;
    currentUserIdRef.current = null;
    setAuthState({
      user: null,
      session: null,
      role: null,
      loading: false,
      displacedByDevice: true,
    });
  }, [stopDeviceCheck]);

  const startDeviceCheck = useCallback(() => {
    stopDeviceCheck();
    checkIntervalRef.current = setInterval(() => void doDeviceCheck(), 30_000);
  }, [doDeviceCheck, stopDeviceCheck]);

  const processSession = useCallback(async (session: Session) => {
    if (!session.user || processedTokenRef.current === session.access_token) return;
    processedTokenRef.current = session.access_token;
    const generation = ++authGenerationRef.current;
    hasSessionRef.current = false;
    stopDeviceCheck();
    setAuthState({
      user: null,
      session: null,
      role: null,
      loading: true,
      displacedByDevice: false,
    });

    const approved = await claimDeviceSession(session.access_token);
    if (generation !== authGenerationRef.current) return;
    if (!approved) {
      deviceDeniedRef.current = true;
      await supabase.auth.signOut();
      hasSessionRef.current = false;
      currentUserIdRef.current = null;
      setAuthState({
        user: null,
        session: null,
        role: null,
        loading: false,
        displacedByDevice: true,
      });
      return;
    }

    deviceDeniedRef.current = false;
    hasSessionRef.current = true;
    currentUserIdRef.current = session.user.id;
    startDeviceCheck();
    void logSessionEvent("session.sign_in", session.user.id, {
      email: session.user.email,
      provider: session.user.app_metadata?.provider ?? "email",
    });

    const { data: { session: latestSession } } = await supabase.auth.getSession();
    const acceptedSession = latestSession || session;
    const role = await fetchUserRole(acceptedSession.user.id);
    if (generation !== authGenerationRef.current) return;
    setAuthState({
      user: acceptedSession.user,
      session: acceptedSession,
      role,
      loading: false,
      displacedByDevice: false,
    });
  }, [startDeviceCheck, stopDeviceCheck]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && hasSessionRef.current) {
        void doDeviceCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    void initSupabase().then(() => {
      if (cancelled) return;
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          const userId = currentUserIdRef.current;
          const denied = deviceDeniedRef.current;
          deviceDeniedRef.current = false;
          authGenerationRef.current += 1;
          processedTokenRef.current = null;
          hasSessionRef.current = false;
          currentUserIdRef.current = null;
          stopDeviceCheck();
          if (userId) void logSessionEvent("session.sign_out", userId);
          setAuthState({
            user: null,
            session: null,
            role: null,
            loading: false,
            displacedByDevice: denied,
          });
          return;
        }

        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
          void processSession(session);
          return;
        }

        if (session?.user) {
          setAuthState((prev) => ({
            ...prev,
            session,
            user: session.user,
          }));
        } else if (event === "INITIAL_SESSION") {
          setAuthState({
            user: null,
            session: null,
            role: null,
            loading: false,
            displacedByDevice: false,
          });
        }
      });
      unsubscribe = () => subscription.unsubscribe();

      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          void processSession(session);
        } else {
          setAuthState({
            user: null,
            session: null,
            role: null,
            loading: false,
            displacedByDevice: false,
          });
        }
      }).catch(() => {
        if (!cancelled) {
          setAuthState({
            user: null,
            session: null,
            role: null,
            loading: false,
            displacedByDevice: false,
          });
        }
      });
    }).catch(() => {
      if (!cancelled) {
        setAuthState({
          user: null,
          session: null,
          role: null,
          loading: false,
          displacedByDevice: false,
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      stopDeviceCheck();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [doDeviceCheck, processSession, stopDeviceCheck]);

  return authState;
};

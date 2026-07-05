import { useState, useEffect, useRef, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, initSupabase } from '@/integrations/supabase/client';
import { claimDeviceSession, checkDeviceSession, getOrCreateDeviceId } from './useDeviceSession';

// ── Session audit logging ─────────────────────────────────────────────────────
async function logSessionEvent(
  action: string,
  userId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await (supabase.from('audit_logs') as any).insert({
      action,
      actor_id: userId,
      entity_type: 'session',
      entity_id: userId,
      user_agent: navigator.userAgent.slice(0, 200),
      metadata: {
        device_id: getOrCreateDeviceId(),
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    });
  } catch {
    // Non-critical — never block auth flow on logging failure
  }
}

export type UserRole = 'admin' | 'agent' | 'client' | 'vendor';

export interface AuthState {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  loading: boolean;
  displacedByDevice: boolean;
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

  const fetchUserRole = async (userId: string): Promise<UserRole | null> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (error) {
      console.error('Error fetching user role:', error);
      return null;
    }
    return data?.role as UserRole;
  };

  const stopDeviceCheck = useCallback(() => {
    if (checkIntervalRef.current) {
      clearInterval(checkIntervalRef.current);
      checkIntervalRef.current = null;
    }
  }, []);

  const doDeviceCheck = useCallback(async () => {
    if (!hasSessionRef.current) return;
    const result = await checkDeviceSession();
    if (result === 'displaced') {
      stopDeviceCheck();
      const uid = currentUserIdRef.current;
      if (uid) {
        void logSessionEvent('session.displaced', uid, {
          reason: 'Another device claimed this session',
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
    }
  }, [stopDeviceCheck]);

  const startDeviceCheck = useCallback(() => {
    stopDeviceCheck();
    checkIntervalRef.current = setInterval(doDeviceCheck, 30_000);
  }, [doDeviceCheck, stopDeviceCheck]);

  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      setAuthState(prev => prev.loading ? { ...prev, loading: false } : prev);
    }, 8000);

    // Check on window focus / tab visibility
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && hasSessionRef.current) {
        doDeviceCheck();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    initSupabase().then(() => {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          setAuthState(prev => ({
            ...prev,
            session,
            user: session?.user ?? null,
            displacedByDevice: false,
          }));

          if (event === 'SIGNED_IN' && session?.user) {
            hasSessionRef.current = true;
            currentUserIdRef.current = session.user.id;
            // Claim this device as the active session for this user
            await claimDeviceSession();
            startDeviceCheck();
            void logSessionEvent('session.sign_in', session.user.id, {
              email: session.user.email,
              provider: session.user.app_metadata?.provider ?? 'email',
            });
          }

          if (event === 'SIGNED_OUT') {
            const uid = currentUserIdRef.current;
            hasSessionRef.current = false;
            currentUserIdRef.current = null;
            stopDeviceCheck();
            if (uid) void logSessionEvent('session.sign_out', uid);
          }

          if (session?.user) {
            setTimeout(async () => {
              const role = await fetchUserRole(session.user.id);
              setAuthState(prev => ({ ...prev, role, loading: false }));
            }, 0);
          } else {
            setAuthState(prev => ({ ...prev, role: null, loading: false }));
          }
        }
      );

      // Check existing (persisted) session
      supabase.auth.getSession().then(({ data: { session } }) => {
        setAuthState(prev => ({
          ...prev,
          session,
          user: session?.user ?? null,
        }));

        if (session?.user) {
          hasSessionRef.current = true;
          fetchUserRole(session.user.id).then(role => {
            setAuthState(prev => ({ ...prev, role, loading: false }));
          });
          // Start device check for existing session (don't re-claim)
          startDeviceCheck();
        } else {
          setAuthState({ user: null, session: null, role: null, loading: false, displacedByDevice: false });
        }
      }).catch(() => {
        setAuthState({ user: null, session: null, role: null, loading: false, displacedByDevice: false });
      });

      return () => subscription.unsubscribe();
    });

    return () => {
      clearTimeout(safetyTimer);
      stopDeviceCheck();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return authState;
};

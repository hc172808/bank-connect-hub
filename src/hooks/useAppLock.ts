import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "vbank_applock_v1";
const LAST_ACTIVE_KEY = "vbank_lastactive_v1";
const LOCK_REQUIRED_KEY = "vbank_applock_required_v1";

interface AppLockSettings {
  enabled: boolean;
  timeoutMinutes: number;
}

function loadSettings(): AppLockSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AppLockSettings>;
      const timeoutMinutes = Number(stored.timeoutMinutes);
      return {
        enabled: true,
        timeoutMinutes: [1, 5, 15, 30, 60].includes(timeoutMinutes) ? timeoutMinutes : 5,
      };
    }
  } catch {
    // Use the required default if stored settings are unavailable.
  }
  return { enabled: true, timeoutMinutes: 5 };
}

function saveSettings(s: AppLockSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, enabled: true }));
  } catch {
    // The lock still applies for this session if storage is unavailable.
  }
}

export function clearAppLockRequirement() {
  try {
    localStorage.removeItem(LOCK_REQUIRED_KEY);
  } catch {
    // Authentication still clears when storage is unavailable.
  }
}

export function useAppLockSettings() {
  const [settings, setSettings] = useState<AppLockSettings>(loadSettings);

  const update = useCallback((patch: Partial<AppLockSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch, enabled: true };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}

export function useAppLock(isAuthenticated: boolean) {
  const [locked, setLocked] = useState(() => {
    try {
      return localStorage.getItem(LOCK_REQUIRED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const settings = loadSettings();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockNow = useCallback(() => {
    if (!isAuthenticated) return;
    try {
      localStorage.setItem(LOCK_REQUIRED_KEY, "1");
    } catch {
      // Keep the in-memory lock even if persistence is unavailable.
    }
    setLocked(true);
  }, [isAuthenticated]);

  const resetTimer = useCallback(() => {
    if (!isAuthenticated) return;
    try {
      localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    } catch {
      // In-memory timeout locking still works without local storage.
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lockNow();
    }, settings.timeoutMinutes * 60 * 1000);
  }, [isAuthenticated, lockNow, settings.timeoutMinutes]);

  const unlock = useCallback(() => {
    try {
      localStorage.removeItem(LOCK_REQUIRED_KEY);
    } catch {
      // Unlocking this session does not depend on local storage.
    }
    setLocked(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let wasLocked = false;
    try {
      wasLocked = localStorage.getItem(LOCK_REQUIRED_KEY) === "1";
    } catch {
      // Fall back to the current in-memory lock state.
    }
    if (wasLocked) {
      const restoreLock = window.setTimeout(() => setLocked(true), 0);
      return () => window.clearTimeout(restoreLock);
    }

    // Check if already expired since last activity
    try {
      const last = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || "0");
      const elapsed = Date.now() - last;
      if (last && elapsed > settings.timeoutMinutes * 60 * 1000) {
        const restoreLock = window.setTimeout(lockNow, 0);
        return () => window.clearTimeout(restoreLock);
      }
    } catch {
      // A missing activity record is treated as a fresh session.
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lockNow();
      } else {
        let shouldStayLocked = false;
        try {
          shouldStayLocked = localStorage.getItem(LOCK_REQUIRED_KEY) === "1";
        } catch {
          // The in-memory locked state remains authoritative.
        }
        if (shouldStayLocked) setLocked(true);
      }
    };
    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", lockNow);
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", lockNow);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, lockNow, resetTimer, settings.timeoutMinutes]);

  return { locked, unlock };
}

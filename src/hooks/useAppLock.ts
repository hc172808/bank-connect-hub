import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "vbank_applock_v1";
const LAST_ACTIVE_KEY = "vbank_lastactive_v1";
const LOCK_REQUIRED_KEY = "vbank_applock_required_v1";
const SETTINGS_CHANGE_EVENT = "vbank:applock-settings-change";

export const APP_LOCK_TIMEOUT_OPTIONS = [
  { minutes: 1, label: "1 minute" },
  { minutes: 5, label: "5 minutes" },
  { minutes: 15, label: "15 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
  { minutes: 480, label: "8 hours" },
] as const;

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
        timeoutMinutes: APP_LOCK_TIMEOUT_OPTIONS.some((option) => option.minutes === timeoutMinutes)
          ? timeoutMinutes
          : 5,
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
  window.dispatchEvent(new Event(SETTINGS_CHANGE_EVENT));
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
  const [settings, setSettings] = useState<AppLockSettings>(loadSettings);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const syncSettings = () => setSettings(loadSettings());
    const syncStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) syncSettings();
    };
    window.addEventListener(SETTINGS_CHANGE_EVENT, syncSettings);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(SETTINGS_CHANGE_EVENT, syncSettings);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  const lockNow = useCallback(() => {
    if (!isAuthenticated) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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

    if (locked) return;

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
      if (document.visibilityState !== "visible") return;

      let lastActive = 0;
      try {
        lastActive = Number(localStorage.getItem(LAST_ACTIVE_KEY) || 0);
      } catch {
        // Without a stored activity timestamp, keep the current session active.
      }

      const idleForMs = lastActive > 0 ? Date.now() - lastActive : 0;
      if (idleForMs >= settings.timeoutMinutes * 60 * 1000) {
        lockNow();
      } else {
        resetTimer();
      }
    };
    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    document.addEventListener("visibilitychange", onVisibilityChange);
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, locked, lockNow, resetTimer, settings.timeoutMinutes]);

  return { locked, unlock };
}

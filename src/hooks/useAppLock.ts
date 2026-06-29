import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "vbank_applock_v1";
const LAST_ACTIVE_KEY = "vbank_lastactive_v1";

interface AppLockSettings {
  enabled: boolean;
  timeoutMinutes: number;
}

function loadSettings(): AppLockSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, timeoutMinutes: 5 };
}

function saveSettings(s: AppLockSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

export function useAppLockSettings() {
  const [settings, setSettings] = useState<AppLockSettings>(loadSettings);

  const update = useCallback((patch: Partial<AppLockSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, update };
}

export function useAppLock() {
  const [locked, setLocked] = useState(false);
  const settings = loadSettings();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (!settings.enabled) return;
    try { localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString()); } catch {}
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLocked(true);
    }, settings.timeoutMinutes * 60 * 1000);
  }, [settings.enabled, settings.timeoutMinutes]);

  const unlock = useCallback(() => {
    setLocked(false);
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!settings.enabled) { setLocked(false); return; }

    // Check if already expired since last activity
    try {
      const last = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) || "0");
      const elapsed = Date.now() - last;
      if (last && elapsed > settings.timeoutMinutes * 60 * 1000) {
        setLocked(true);
        return;
      }
    } catch {}

    const events = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [settings.enabled, settings.timeoutMinutes, resetTimer]);

  return { locked, unlock };
}

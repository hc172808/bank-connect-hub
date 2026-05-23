import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { THEME_PRESETS, DEFAULT_THEME_ID, ThemeId, getPreset, ThemePreset } from "@/lib/themes";
import { supabase } from "@/integrations/supabase/client";

type Mode = "light" | "dark";

interface ThemeContextValue {
  themeId: ThemeId;
  mode: Mode;
  setThemeId: (id: ThemeId) => void;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  presets: ThemePreset[];          // all presets (used by admin)
  enabledPresets: ThemePreset[];   // admin-filtered presets (used by users)
  themeLocked: boolean;            // admin locked — users can't change theme
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY_THEME = "vb.themeId";
const STORAGE_KEY_MODE = "vb.themeMode";

const applyTheme = (id: ThemeId, mode: Mode) => {
  const preset = getPreset(id);
  const root = document.documentElement;
  Object.entries(preset.vars).forEach(([k, v]) => root.style.setProperty(k, v));
  if (mode === "dark") {
    root.classList.add("dark");
    if (preset.darkVars) {
      Object.entries(preset.darkVars).forEach(([k, v]) => root.style.setProperty(k, v));
    }
  } else {
    root.classList.remove("dark");
  }
  root.dataset.theme = id;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    return (localStorage.getItem(STORAGE_KEY_THEME) as ThemeId) || DEFAULT_THEME_ID;
  });
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(STORAGE_KEY_MODE) as Mode) || "light";
  });
  const [enabledPresets, setEnabledPresets] = useState<ThemePreset[]>(THEME_PRESETS);
  const [themeLocked, setThemeLocked] = useState(false);

  // Apply theme CSS vars whenever theme or mode changes
  useEffect(() => {
    applyTheme(themeId, mode);
  }, [themeId, mode]);

  // Fetch admin theme settings from Supabase once on mount
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["default_theme", "enabled_themes", "lock_theme"])
      .then(({ data }) => {
        if (!data) return;
        for (const row of data) {
          if (row.key === "default_theme") {
            // Only apply admin default if the user has never picked their own
            const stored = localStorage.getItem(STORAGE_KEY_THEME);
            if (!stored) {
              setThemeIdState(row.value as ThemeId);
            }
          }
          if (row.key === "enabled_themes") {
            try {
              const ids: ThemeId[] = JSON.parse(row.value);
              const filtered = THEME_PRESETS.filter((p) => ids.includes(p.id as ThemeId));
              if (filtered.length > 0) setEnabledPresets(filtered);
            } catch { /* keep all presets as fallback */ }
          }
          if (row.key === "lock_theme") {
            setThemeLocked(row.value === "true");
          }
        }
      })
      .catch(() => { /* silently ignore — table may not exist yet */ });
  }, []);

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    try { localStorage.setItem(STORAGE_KEY_THEME, id); } catch { /* ignore */ }
  };

  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem(STORAGE_KEY_MODE, m); } catch { /* ignore */ }
  };

  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider
      value={{ themeId, mode, setThemeId, setMode, toggleMode, presets: THEME_PRESETS, enabledPresets, themeLocked }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

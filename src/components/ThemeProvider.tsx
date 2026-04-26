import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { THEME_PRESETS, DEFAULT_THEME_ID, ThemeId, getPreset } from "@/lib/themes";

type Mode = "light" | "dark";

interface ThemeContextValue {
  themeId: ThemeId;
  mode: Mode;
  setThemeId: (id: ThemeId) => void;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  presets: typeof THEME_PRESETS;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY_THEME = "vb.themeId";
const STORAGE_KEY_MODE = "vb.themeMode";

const applyTheme = (id: ThemeId, mode: Mode) => {
  const preset = getPreset(id);
  const root = document.documentElement;
  // Reset any previously applied vars so switching presets doesn't leak.
  // We only set keys defined on this preset; the base values live in index.css.
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

  useEffect(() => {
    applyTheme(themeId, mode);
  }, [themeId, mode]);

  const setThemeId = (id: ThemeId) => {
    setThemeIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, id);
    } catch {
      // ignore
    }
  };

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY_MODE, m);
    } catch {
      // ignore
    }
  };

  const toggleMode = () => setMode(mode === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider
      value={{ themeId, mode, setThemeId, setMode, toggleMode, presets: THEME_PRESETS }}
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

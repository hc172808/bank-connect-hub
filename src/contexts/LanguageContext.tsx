import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { translations, Locale, LOCALES, RTL_LOCALES } from "@/locales";

type LanguageContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  isRTL: boolean;
};

const LanguageContext = createContext<LanguageContextType>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
  isRTL: false,
});

function getStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem("vbank_language") as Locale;
    return LOCALES.includes(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

function resolveKey(obj: Record<string, unknown>, key: string): string {
  const parts = key.split(".");
  let cursor: unknown = obj;
  for (const part of parts) {
    if (cursor == null || typeof cursor !== "object") return key;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" ? cursor : key;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getStoredLocale);
  const isRTL = RTL_LOCALES.includes(locale);

  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    try { localStorage.setItem("vbank_language", locale); } catch {}
  }, [locale, isRTL]);

  const setLocale = (l: Locale) => setLocaleState(l);

  const t = (key: string): string =>
    resolveKey(translations[locale] as Record<string, unknown>, key) ||
    resolveKey(translations.en as Record<string, unknown>, key) ||
    key;

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

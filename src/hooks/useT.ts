import { useLanguage } from "@/contexts/LanguageContext";
export { useLanguage };

/** Convenience hook — returns t(), locale and isRTL. */
export function useT() {
  const { t, locale, isRTL } = useLanguage();
  return { t, locale, isRTL };
}

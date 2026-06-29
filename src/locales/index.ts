import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { pt } from "./pt";
import { ar } from "./ar";

export type { Translations } from "./en";

export const LOCALES = ["en", "es", "fr", "pt", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  pt: "Português",
  ar: "العربية",
};

export const LOCALE_FLAGS: Record<Locale, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  fr: "🇫🇷",
  pt: "🇧🇷",
  ar: "🇸🇦",
};

export const RTL_LOCALES: Locale[] = ["ar"];

export const translations: Record<Locale, typeof en> = { en, es, fr, pt, ar };

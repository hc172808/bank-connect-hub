import { useLanguage } from "@/contexts/LanguageContext";
import { LOCALE_FLAGS, LOCALE_NAMES, LOCALES, Locale } from "@/locales";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

export function LanguageSelector({ className }: Props) {
  const { locale, setLocale, t } = useLanguage();

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm font-medium text-muted-foreground">{t("profile.selectLanguage")}</p>
      <div className="grid grid-cols-1 gap-2">
        {LOCALES.map((l: Locale) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={cn(
              "flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all",
              locale === l
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-3">
              <span className="text-lg">{LOCALE_FLAGS[l]}</span>
              <span>{LOCALE_NAMES[l]}</span>
            </span>
            {locale === l && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}

import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Country {
  code: string;
  name: string;
  dial_code: string;
  local_number_length: number;
  is_allowed: boolean;
  is_banned: boolean;
}

// Hardcoded fallback — shown immediately on first render and on mobile where
// the Supabase query may be slow or the countries table may not yet have data.
const DEFAULT_COUNTRIES: Country[] = [
  { code: "GY", name: "Guyana",          dial_code: "+592",  local_number_length: 7,  is_allowed: true, is_banned: false },
  { code: "US", name: "United States",   dial_code: "+1",    local_number_length: 10, is_allowed: true, is_banned: false },
  { code: "GB", name: "United Kingdom",  dial_code: "+44",   local_number_length: 10, is_allowed: true, is_banned: false },
  { code: "TT", name: "Trinidad & Tobago", dial_code: "+1868", local_number_length: 7, is_allowed: true, is_banned: false },
  { code: "BB", name: "Barbados",        dial_code: "+1246", local_number_length: 7,  is_allowed: true, is_banned: false },
  { code: "JM", name: "Jamaica",         dial_code: "+1876", local_number_length: 7,  is_allowed: true, is_banned: false },
  { code: "BR", name: "Brazil",          dial_code: "+55",   local_number_length: 11, is_allowed: true, is_banned: false },
  { code: "IN", name: "India",           dial_code: "+91",   local_number_length: 10, is_allowed: true, is_banned: false },
  { code: "CA", name: "Canada",          dial_code: "+1",    local_number_length: 10, is_allowed: true, is_banned: false },
  { code: "AU", name: "Australia",       dial_code: "+61",   local_number_length: 9,  is_allowed: true, is_banned: false },
];

const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

interface Props {
  value: string;
  onChange: (e164: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Multi-country phone input. Shows hardcoded defaults immediately, then
 * replaces with allowed/non-banned countries from the `countries` table.
 * Defaults to +592 (Guyana). Emits full E.164.
 */
export const CountryPhoneInput: React.FC<Props> = ({
  value,
  onChange,
  className,
  placeholder,
  disabled,
}) => {
  const [countries, setCountries] = useState<Country[]>(DEFAULT_COUNTRIES);
  const [dial, setDial] = useState<string>("+592");
  const [local, setLocal] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase
          .from("countries" as never)
          .select("*")
          .eq("is_allowed", true)
          .eq("is_banned", false)
          .order("sort_order");
        const list = (data as Country[]) || [];
        // Only replace defaults if we actually got rows back
        if (list.length > 0) {
          setCountries(list);
        }
      } catch {
        // Keep defaults on error
      }
    })();
  }, []);

  // Parse incoming value once countries are available
  useEffect(() => {
    if (!value) return;
    const match = countries
      .slice()
      .sort((a, b) => b.dial_code.length - a.dial_code.length)
      .find((c) => value.startsWith(c.dial_code));
    if (match) {
      setDial(match.dial_code);
      setLocal(value.slice(match.dial_code.length));
    }
  }, [value, countries]);

  const current = useMemo(
    () => countries.find((c) => c.dial_code === dial) ?? countries[0],
    [countries, dial]
  );
  const maxLen = current?.local_number_length ?? 10;

  const update = (d: string, l: string) => {
    setDial(d);
    setLocal(l);
    onChange(l ? `${d}${l}` : "");
  };

  // Deduplicate by dial_code for display (e.g. US and CA both use +1)
  const displayCountries = useMemo(() => {
    const seen = new Set<string>();
    return countries.filter(c => {
      if (seen.has(c.dial_code)) return false;
      seen.add(c.dial_code);
      return true;
    });
  }, [countries]);

  return (
    <div className={cn("flex items-stretch rounded-xl border border-input bg-background overflow-hidden", className)}>
      <Select value={dial} onValueChange={(v) => update(v, local)} disabled={disabled}>
        <SelectTrigger className="w-[110px] border-0 rounded-none bg-muted focus:ring-0 shrink-0">
          <SelectValue>
            <span className="text-sm font-medium">
              {current?.code ?? "GY"} {dial}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {displayCountries.map((c) => (
            <SelectItem key={c.dial_code} value={c.dial_code}>
              {c.code} {c.dial_code} — {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={placeholder ?? "Phone number"}
        value={local}
        disabled={disabled}
        onChange={(e) => update(dial, onlyDigits(e.target.value).slice(0, maxLen))}
        maxLength={maxLen}
        className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 flex-1"
      />
    </div>
  );
};

export default CountryPhoneInput;

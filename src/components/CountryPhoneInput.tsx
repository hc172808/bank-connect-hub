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

const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

interface Props {
  value: string;
  onChange: (e164: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Multi-country phone input. Pulls allowed/non-banned countries from the
 * `countries` table. Defaults to +592 (Guyana). Emits full E.164.
 */
export const CountryPhoneInput: React.FC<Props> = ({
  value,
  onChange,
  className,
  placeholder,
  disabled,
}) => {
  const [countries, setCountries] = useState<Country[]>([]);
  const [dial, setDial] = useState<string>("+592");
  const [local, setLocal] = useState<string>("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("countries" as never)
        .select("*")
        .eq("is_allowed", true)
        .eq("is_banned", false)
        .order("sort_order");
      const list = (data as Country[]) || [];
      setCountries(list);
    })();
  }, []);

  // Parse incoming value once
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
    () => countries.find((c) => c.dial_code === dial) || countries[0],
    [countries, dial]
  );
  const maxLen = current?.local_number_length ?? 10;

  const update = (d: string, l: string) => {
    setDial(d);
    setLocal(l);
    onChange(l ? `${d}${l}` : "");
  };

  return (
    <div className={cn("flex items-stretch rounded-xl border border-input bg-background overflow-hidden", className)}>
      <Select value={dial} onValueChange={(v) => update(v, local)} disabled={disabled}>
        <SelectTrigger className="w-[110px] border-0 rounded-none bg-muted focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {countries.map((c) => (
            <SelectItem key={c.code} value={c.dial_code}>
              {c.code} {c.dial_code}
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
        className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
};

export default CountryPhoneInput;
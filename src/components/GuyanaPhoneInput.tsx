import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GY_DIAL_CODE, GY_LOCAL_LENGTH, onlyDigits } from "@/lib/phone";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  /** Full E.164 value, e.g. "+5921234567". */
  value: string;
  /** Receives full E.164 value (or partial while typing). */
  onChange: (e164: string) => void;
  inputClassName?: string;
}

/**
 * Locked +592 prefix; user only enters the 7 local digits.
 * Always emits a +592-prefixed value, never bare local digits.
 */
export const GuyanaPhoneInput: React.FC<Props> = ({
  value,
  onChange,
  className,
  inputClassName,
  placeholder = "1234567",
  ...rest
}) => {
  // Extract local digits from any prior value
  const local = React.useMemo(() => {
    const d = onlyDigits(value);
    if (d.startsWith("592")) return d.slice(3, 3 + GY_LOCAL_LENGTH);
    return d.slice(0, GY_LOCAL_LENGTH);
  }, [value]);

  return (
    <div className={cn("flex items-stretch rounded-xl border border-input bg-background overflow-hidden", className)}>
      <span className="flex items-center px-3 bg-muted text-muted-foreground text-sm font-medium border-r border-input select-none">
        {GY_DIAL_CODE}
      </span>
      <Input
        {...rest}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={local}
        onChange={(e) => {
          const next = onlyDigits(e.target.value).slice(0, GY_LOCAL_LENGTH);
          onChange(next ? `${GY_DIAL_CODE}${next}` : "");
        }}
        maxLength={GY_LOCAL_LENGTH}
        className={cn("border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0", inputClassName)}
      />
    </div>
  );
};

export default GuyanaPhoneInput;
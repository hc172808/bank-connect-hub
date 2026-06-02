// Guyana phone number helpers. All user phone numbers in this app are
// stored in E.164 format starting with +592 followed by 7 local digits.

export const GY_DIAL_CODE = "+592";
export const GY_LOCAL_LENGTH = 7;

/** Strip everything except digits. */
export const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

/**
 * Normalize whatever the user typed into a canonical +592XXXXXXX string.
 * Returns null when we can't produce a valid number.
 */
export const normalizeGuyanaPhone = (raw: string): string | null => {
  let d = onlyDigits(raw);
  if (!d) return null;
  // Strip leading country code variants
  if (d.startsWith("592")) d = d.slice(3);
  // Drop a leading 0 if user typed local trunk prefix
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length !== GY_LOCAL_LENGTH) return null;
  return `${GY_DIAL_CODE}${d}`;
};

export const isValidGuyanaPhone = (raw: string): boolean =>
  normalizeGuyanaPhone(raw) !== null;

/** Format for display: "+592 123 4567". Falls back to input on failure. */
export const formatGuyanaPhone = (raw: string): string => {
  const n = normalizeGuyanaPhone(raw);
  if (!n) return raw;
  const local = n.slice(4);
  return `${GY_DIAL_CODE} ${local.slice(0, 3)} ${local.slice(3)}`;
};
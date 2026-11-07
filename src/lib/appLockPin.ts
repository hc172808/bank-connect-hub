export function isValidAppLockPin(value: string): boolean {
  // Accept printable ASCII letters, digits, and symbols; spaces are excluded.
  return /^[!-~]{4,10}$/.test(value);
}

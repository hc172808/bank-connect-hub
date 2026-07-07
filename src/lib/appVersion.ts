/**
 * APP_VERSION is the semantic version of this web build.
 * Bump this whenever you publish a new APK so that force-update and
 * update-banner comparisons work correctly.
 */
export const APP_VERSION = "1.0.0";

/** Semver-style comparison: returns negative if a < b, 0 if equal, positive if a > b */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.replace(/[^0-9.]/g, "").split(".").map(Number);
  const [aMaj = 0, aMin = 0, aPat = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPat = 0] = parse(b);
  return aMaj !== bMaj ? aMaj - bMaj : aMin !== bMin ? aMin - bMin : aPat - bPat;
}

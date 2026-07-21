import { supabase } from "@/integrations/supabase/client";

// Convert ArrayBuffer to base64 string
function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// Convert base64 string to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return buffer;
}

/** Returns true if the device has ANY platform biometric authenticator (fingerprint, Face ID, Windows Hello, etc.) */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    // Primary check: platform authenticator (fingerprint / Face ID / Windows Hello)
    const platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (platform) return true;

    // Secondary check: conditional UI (passkeys) — newer devices/browsers
    if (typeof (PublicKeyCredential as any).isConditionalMediationAvailable === "function") {
      const conditional = await (PublicKeyCredential as any).isConditionalMediationAvailable();
      if (conditional) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Detect if the page is currently inside an iframe (e.g. Replit preview pane). */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Detect which biometric types the platform likely supports.
 * This is best-effort — WebAuthn doesn't expose exact sensor type.
 */
export async function detectBiometricTypes(): Promise<{
  fingerprint: boolean;
  face: boolean;
  any: boolean;
}> {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isMac = /macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPad or Mac with Touch ID
  const isAndroid = /android/.test(ua);
  const isDesktop = !isIOS && !isAndroid;

  const available = await isBiometricAvailable();
  if (!available) return { fingerprint: false, face: false, any: false };

  // iOS: Face ID on newer iPhones (X+), Touch ID on older / iPad
  // Android: usually fingerprint, some have face unlock
  // Desktop: Windows Hello (face or fingerprint), Mac Touch ID
  return {
    fingerprint: isAndroid || isDesktop || isIOS,
    face: isIOS || isAndroid || isDesktop, // let the OS decide which to show
    any: true,
  };
}

/**
 * Detailed availability check used by the UI before showing enrollment buttons.
 * NOTE: Being inside an iframe is a WARNING not a hard blocker — WebAuthn may still
 * work depending on the browser/OS combination.
 */
export async function checkBiometricSupport(): Promise<{
  ok: boolean;
  reason?: string;
  hint?: string;
  warning?: string;
}> {
  if (!window.PublicKeyCredential) {
    return {
      ok: false,
      reason: "Your browser doesn't support biometric login (WebAuthn).",
      hint: "Use Chrome, Safari, or Edge on a modern phone or laptop.",
    };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: "Biometric login requires HTTPS.",
      hint: "Open the app via its https:// address.",
    };
  }

  // Iframe: warn but still allow — the OS may handle the prompt correctly
  const inFrame = isInIframe();

  try {
    const platformOk = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!platformOk) {
      // Try conditional mediation as fallback
      let conditionalOk = false;
      if (typeof (PublicKeyCredential as any).isConditionalMediationAvailable === "function") {
        conditionalOk = await (PublicKeyCredential as any).isConditionalMediationAvailable().catch(() => false);
      }
      if (!conditionalOk) {
        return {
          ok: false,
          reason: "No fingerprint or face sensor detected on this device.",
          hint: "Use a phone with Face ID / fingerprint, or a laptop with Touch ID / Windows Hello — and make sure it's set up in the OS first.",
        };
      }
    }
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Biometric check failed." };
  }

  return {
    ok: true,
    warning: inFrame
      ? "You're in a preview frame. If enrollment fails, open the app in a full browser tab."
      : undefined,
  };
}

/**
 * Enroll biometric credential for the currently logged-in user.
 */
export async function enrollBiometric(
  userId: string,
  userName: string,
  authType: "fingerprint" | "face"
): Promise<{ success: boolean; error?: string }> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "NETLIFE CASH", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },   // ES256
          { alg: -257, type: "public-key" },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required",
          requireResidentKey: true,
        },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { success: false, error: "Credential creation cancelled" };

    const response = credential.response as AuthenticatorAttestationResponse;
    const credentialId = bufferToBase64(credential.rawId);
    const publicKey = bufferToBase64(response.getPublicKey?.() || response.attestationObject);

    // Detect device name from user agent
    const ua = navigator.userAgent;
    const deviceName = ua.includes("iPhone") || ua.includes("iPad")
      ? "iOS Device"
      : ua.includes("Android")
      ? "Android Device"
      : ua.includes("Macintosh")
      ? "Mac (Touch ID)"
      : ua.includes("Windows")
      ? "Windows (Hello)"
      : "Desktop";

    const { error } = await supabase.from("biometric_credentials").insert({
      user_id: userId,
      credential_id: credentialId,
      public_key: publicKey,
      auth_type: authType,
      device_name: deviceName,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    const name = err?.name || "";
    if (name === "NotAllowedError") return { success: false, error: "cancelled" };
    if (name === "InvalidStateError") {
      return { success: false, error: "This device is already enrolled. Remove the existing entry first." };
    }
    if (name === "NotSupportedError") {
      return { success: false, error: "This device doesn't support the requested biometric type." };
    }
    if (name === "SecurityError") {
      return {
        success: false,
        error: "Blocked by security policy. Open the app in a new tab (not the preview frame) and try again.",
      };
    }
    if (name === "AbortError") {
      return { success: false, error: "Biometric prompt was closed before finishing." };
    }
    return { success: false, error: err?.message || "Biometric enrollment failed" };
  }
}

/**
 * Authenticate with biometrics. Returns the phone number associated with the credential.
 */
export async function authenticateWithBiometric(): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        userVerification: "required",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { success: false, error: "Authentication cancelled" };

    const credentialId = bufferToBase64(credential.rawId);

    const storedPhone = localStorage.getItem(`biometric_phone_${credentialId}`);
    if (!storedPhone) {
      return {
        success: false,
        error: "No account linked to this biometric. Please sign in with your password first and enroll from Profile settings.",
      };
    }

    return { success: true, userId: storedPhone };
  } catch (err: any) {
    if (err.name === "NotAllowedError") return { success: false, error: "cancelled" };
    return { success: false, error: err.message || "Biometric authentication failed" };
  }
}

/** Link a credential ID to a phone number in localStorage for passwordless lookup. */
export function linkCredentialToPhone(credentialId: string, phoneNumber: string, password: string) {
  localStorage.setItem(`biometric_phone_${credentialId}`, phoneNumber);
  localStorage.setItem(`biometric_cred_${phoneNumber}`, credentialId);
  // Encode password for auto-login (base64 only — not crypto-grade, but enables convenience login)
  localStorage.setItem(`biometric_auth_${credentialId}`, btoa(password));
}

/** Get stored auth data for biometric login */
export function getBiometricAuthData(credentialId: string): { phone: string; password: string } | null {
  const phone = localStorage.getItem(`biometric_phone_${credentialId}`);
  const encPassword = localStorage.getItem(`biometric_auth_${credentialId}`);
  if (!phone || !encPassword) return null;
  return { phone, password: atob(encPassword) };
}

/** Check if user has any biometric credential enrolled on this device */
export function hasStoredBiometric(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("biometric_cred_")) {
      return localStorage.getItem(key);
    }
  }
  return null;
}

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

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
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
 * Detailed availability check used by the UI before showing enrollment buttons.
 */
export async function checkBiometricSupport(): Promise<{
  ok: boolean;
  reason?: string;
  hint?: string;
}> {
  if (!window.PublicKeyCredential) {
    return {
      ok: false,
      reason: "Your browser doesn't support biometric login (WebAuthn).",
      hint: "Use a modern browser like Chrome, Safari or Edge.",
    };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: "Biometric login requires HTTPS.",
      hint: "Open the app via its https:// address.",
    };
  }
  if (isInIframe()) {
    return {
      ok: false,
      reason: "Biometric login cannot run inside the preview frame.",
      hint: "Open the app in a new tab (or in the installed mobile app) to add Face ID / Fingerprint.",
    };
  }
  try {
    const platformOk = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!platformOk) {
      return {
        ok: false,
        reason: "No fingerprint or face sensor was detected on this device.",
        hint:
          "Use a phone with Face ID / fingerprint, or a laptop with Touch ID / Windows Hello — and make sure it's set up in the OS first.",
      };
    }
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Biometric check failed." };
  }
  return { ok: true };
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
        rp: { name: "Virtual Bank", id: window.location.hostname },
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

    // Store in database
    const { error } = await supabase.from("biometric_credentials").insert({
      user_id: userId,
      credential_id: credentialId,
      public_key: publicKey,
      auth_type: authType,
      device_name: navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad")
        ? "iOS Device"
        : navigator.userAgent.includes("Android")
        ? "Android Device"
        : "Desktop",
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
      return { success: false, error: "Blocked by security policy. Open the app in a new tab (not inside the preview) and try again." };
    }
    if (name === "AbortError") {
      return { success: false, error: "Biometric prompt was closed before finishing." };
    }
    return { success: false, error: err?.message || "Biometric enrollment failed" };
  }
}

/**
 * Authenticate with biometrics. Looks up stored credential and verifies.
 * Returns the user_id associated with the credential on success.
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

    // Look up credential in DB (need to find it without auth — use phone number flow)
    // Since we can't query without auth, we store the credential_id locally
    const storedPhone = localStorage.getItem(`biometric_phone_${credentialId}`);
    if (!storedPhone) {
      return { success: false, error: "No account linked to this biometric. Please sign in with password first and enroll." };
    }

    return { success: true, userId: storedPhone };
  } catch (err: any) {
    if (err.name === "NotAllowedError") return { success: false, error: "cancelled" };
    return { success: false, error: err.message || "Biometric authentication failed" };
  }
}

/**
 * Link a credential ID to a phone number in localStorage for passwordless lookup.
 */
export function linkCredentialToPhone(credentialId: string, phoneNumber: string, password: string) {
  localStorage.setItem(`biometric_phone_${credentialId}`, phoneNumber);
  // Store encrypted password reference for auto-login
  localStorage.setItem(`biometric_cred_${phoneNumber}`, credentialId);
  // Store password in sessionStorage-like encrypted form (base64 only — not truly secure but enables auto-login)
  localStorage.setItem(`biometric_auth_${credentialId}`, btoa(password));
}

/**
 * Get stored auth data for biometric login
 */
export function getBiometricAuthData(credentialId: string): { phone: string; password: string } | null {
  const phone = localStorage.getItem(`biometric_phone_${credentialId}`);
  const encPassword = localStorage.getItem(`biometric_auth_${credentialId}`);
  if (!phone || !encPassword) return null;
  return { phone, password: atob(encPassword) };
}

/**
 * Check if user has biometric enrolled
 */
export function hasStoredBiometric(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("biometric_cred_")) {
      return localStorage.getItem(key);
    }
  }
  return null;
}

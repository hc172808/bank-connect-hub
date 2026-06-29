import { supabase } from '@/integrations/supabase/client';

const DEVICE_ID_KEY = 'vbank_device_id';

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Called immediately after a SIGNED_IN event.
 * Marks this browser as the only active device in the user's metadata.
 */
export async function claimDeviceSession(): Promise<void> {
  try {
    const deviceId = getOrCreateDeviceId();
    await supabase.auth.updateUser({
      data: { active_device_id: deviceId },
    });
  } catch {
    // Non-fatal — don't block the sign-in flow
  }
}

/**
 * Polls Supabase for the freshest user metadata and compares device IDs.
 * Returns 'valid'    — this device is still the active one
 * Returns 'displaced'— another device has logged in and taken over
 * Returns 'no_session'— the user has been signed out already
 */
export async function checkDeviceSession(): Promise<'valid' | 'displaced' | 'no_session'> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return 'no_session';
    const activeDeviceId: string | undefined = user.user_metadata?.active_device_id;
    if (!activeDeviceId) return 'valid'; // no claim recorded yet
    return activeDeviceId === getOrCreateDeviceId() ? 'valid' : 'displaced';
  } catch {
    return 'valid'; // on network error, don't kick out
  }
}

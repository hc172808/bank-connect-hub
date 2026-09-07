import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Build-time env vars (baked into the bundle by Vite — safe for the anon/public key).
// Used as an immediate fallback if /api/config is unreachable (e.g. mobile APK builds).
// Values must be safe to place in an HTTP header (Latin-1 / ASCII only).
// A stray smart quote, en-dash or non-breaking space pasted into the server
// .env otherwise makes every fetch throw:
// "String contains non ISO-8859-1 code point".
function sanitizeCredential(value: string | undefined | null): string {
  if (!value) return '';
  // Strip surrounding quotes/whitespace (including non-breaking spaces / BOM).
  const cleaned = value
    .replace(/^[\s\u00a0\ufeff"']+|[\s\u00a0\ufeff"']+$/g, '')
    .replace(/[\r\n\t]/g, '');
  // Reject anything that cannot be sent as a header value.
  // eslint-disable-next-line no-control-regex
  if (!/^[\x20-\x7e]*$/.test(cleaned)) {
    console.error('[supabase] Credential contains invalid (non-ASCII) characters — ignoring it. Check VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY on the server.');
    return '';
  }
  return cleaned;
}

const ENV_URL = sanitizeCredential(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const ENV_KEY = sanitizeCredential(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);

let _supabaseUrl = ENV_URL || '';
let _supabaseAnonKey = ENV_KEY || '';
let _initPromise: Promise<void> | null = null;

function makeClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: {
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// Start with real credentials if env vars are available (covers mobile APK builds),
// otherwise use a placeholder that will be replaced once /api/config responds.
let _client = (_supabaseUrl && _supabaseAnonKey)
  ? makeClient(_supabaseUrl, _supabaseAnonKey)
  : makeClient('http://localhost', 'placeholder');

export async function initSupabase(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = fetch('/api/config')
    .then(r => r.json())
    .then((cfg: { supabaseUrl: string; supabaseAnonKey: string }) => {
      const url = sanitizeCredential(cfg.supabaseUrl);
      const key = sanitizeCredential(cfg.supabaseAnonKey);
      if (url && key) {
        _supabaseUrl = url;
        _supabaseAnonKey = key;
        _client = makeClient(url, key);
      } else if (ENV_URL && ENV_KEY) {
        // Server config was empty or malformed — keep the build-time values.
        _supabaseUrl = ENV_URL;
        _supabaseAnonKey = ENV_KEY;
        _client = makeClient(ENV_URL, ENV_KEY);
        console.warn('[supabase] /api/config returned unusable credentials — using build-time env vars');
      }
    })
    .catch(() => {
      // /api/config unreachable (e.g. mobile APK, offline). Fall back to build-time
      // env vars which Vite has already baked into the bundle.
      if (ENV_URL && ENV_KEY) {
        _supabaseUrl = ENV_URL;
        _supabaseAnonKey = ENV_KEY;
        _client = makeClient(ENV_URL, ENV_KEY);
        console.warn('[supabase] /api/config unreachable — using build-time env vars');
      } else {
        console.error('[supabase] No credentials available — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
      }
    });
  return _initPromise;
}

// Start the init immediately so it runs in parallel with React rendering.
initSupabase();

// Export a stable reference — internal _client is replaced on init.
// All callers go through this getter so they always get the live client.
export function getSupabase() {
  return _client;
}

// Legacy named export kept for the 112+ files that import it directly.
// Wraps getSupabase() via a Proxy so property access always hits the live client.
export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_t, prop) {
    return (getSupabase() as any)[prop];
  },
});

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Build-time env vars (baked into the bundle by Vite — safe for the anon/public key).
// Used as an immediate fallback if /api/config is unreachable (e.g. mobile APK builds).
const ENV_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ENV_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

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
      if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
        _supabaseUrl = cfg.supabaseUrl;
        _supabaseAnonKey = cfg.supabaseAnonKey;
        _client = makeClient(_supabaseUrl, _supabaseAnonKey);
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

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Config is fetched once from the server at runtime (keeps secrets off the browser bundle).
// Components that call supabase must await initSupabase() first — or use the hook.
let _supabaseUrl = '';
let _supabaseAnonKey = '';
let _initPromise: Promise<void> | null = null;

export async function initSupabase(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = fetch('/api/config')
    .then(r => r.json())
    .then((cfg: { supabaseUrl: string; supabaseAnonKey: string }) => {
      _supabaseUrl = cfg.supabaseUrl;
      _supabaseAnonKey = cfg.supabaseAnonKey;
      // Reinitialise the singleton with the real credentials
      _client = createClient<Database>(_supabaseUrl, _supabaseAnonKey, {
        auth: {
          storage: localStorage,
          persistSession: true,
          autoRefreshToken: true,
        },
      });
    })
    .catch(() => {
      console.error('[supabase] Failed to load config from /api/config');
    });
  return _initPromise;
}

// Start the init immediately so it runs in parallel with React rendering.
initSupabase();

// Placeholder client — replaced by initSupabase() before any auth call resolves.
// Using localhost as placeholder avoids DNS resolution attempts before real creds load.
let _client = createClient<Database>('http://localhost', 'placeholder', {
  auth: {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

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

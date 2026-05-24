// ─────────────────────────────────────────────────────────────────────────────
// Supabase client
//
// ENV VAR PRIORITY (runtime env injection for multi-server support):
//   1. window.__ENV__        ← injected by docker/generate-env.sh at container start
//   2. import.meta.env.*     ← baked at Vite build time (development / Replit)
//
// This means one Docker image can run on any number of servers — each server
// sets its own .env file pointing at the shared Supabase project.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Runtime env injected by docker/generate-env.sh (production)
declare global {
  interface Window {
    __ENV__?: {
      VITE_SUPABASE_URL?: string;
      VITE_SUPABASE_PUBLISHABLE_KEY?: string;
      VITE_SUPABASE_PROJECT_ID?: string;
      VITE_WHATSAPP_SUPPORT_NUMBER?: string;
      [key: string]: string | undefined;
    };
  }
}

const SUPABASE_URL =
  (typeof window !== 'undefined' && window.__ENV__?.VITE_SUPABASE_URL) ||
  import.meta.env.VITE_SUPABASE_URL;

const SUPABASE_PUBLISHABLE_KEY =
  (typeof window !== 'undefined' && window.__ENV__?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

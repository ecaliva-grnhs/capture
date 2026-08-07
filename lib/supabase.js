import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client. Uses the service-role key so route handlers can
// read/write freely — this app is single-user with no row-level auth, and the
// key never reaches the browser (these modules only run on the server).
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached = null;

export function getSupabase() {
  if (!url || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }
  if (!cached) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return cached;
}

import { createClient } from '@supabase/supabase-js';
import { required } from './env.js';

// Server-side Supabase client. Uses the service-role key so route handlers can
// read/write freely — this app is single-user with no row-level auth, and the
// key never reaches the browser (this module only runs on the server).
//
// Because the service-role key bypasses RLS, the API routes are the only
// access control: every mutating handler must call requireCaptureToken().

let cached = null;

export function getSupabase() {
  if (!cached) {
    cached = createClient(
      required('SUPABASE_URL'),
      required('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );
  }
  return cached;
}

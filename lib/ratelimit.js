import { getSupabase } from './supabase.js';
import { CONFIG } from './env.js';
import { tooManyRequests } from './errors.js';

/**
 * Sliding-window rate limit, enforced in Postgres.
 *
 * Serverless instances don't share memory, so an in-process counter would only
 * limit whichever instance happened to serve the request. The database is the
 * one place every instance agrees on.
 *
 * Fails open on infrastructure error: if the limiter itself is broken, that
 * shouldn't be the thing that stops a capture from being saved.
 */
export async function enforceRateLimit(bucket, { supabase = null } = {}) {
  const db = supabase || getSupabase();

  const { data, error } = await db.rpc('check_rate_limit', {
    bucket_key: bucket,
    max_hits: CONFIG.rateLimitMax(),
    window_seconds: CONFIG.rateLimitWindowSec(),
  });

  if (error) {
    console.error('[ratelimit] check failed, allowing request:', error);
    return;
  }

  if (data === false) {
    throw tooManyRequests(
      `Rate limit exceeded (${CONFIG.rateLimitMax()} requests per ${CONFIG.rateLimitWindowSec()}s).`
    );
  }
}

/**
 * Bucket key for a request. Single-user app, so the token holder is the only
 * legitimate caller; we bucket by client IP to blunt a burst from any one
 * source without letting an attacker exhaust the legitimate user's budget.
 */
export function bucketFor(req, scope) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim() || 'unknown';
  return `${scope}:${ip}`;
}

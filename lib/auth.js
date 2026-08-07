import { timingSafeEqual } from 'node:crypto';
import { required } from './env.js';
import { unauthorized } from './errors.js';

export const TOKEN_HEADER = 'x-capture-token';

/** Constant-time string compare that doesn't leak length via early return. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing profile doesn't distinguish
    // "wrong length" from "wrong value".
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Guard every mutating endpoint.
 *
 * Fails closed: `required()` throws when CAPTURE_TOKEN is unset, so a
 * misconfigured deployment rejects writes instead of silently accepting them
 * from anyone. Accepts the token as `x-capture-token` or as a bearer token,
 * whichever is easier to wire into a given client.
 */
export function requireCaptureToken(req) {
  const expected = required('CAPTURE_TOKEN');
  const presented = presentedToken(req);

  if (!presented || !safeEqual(presented, expected)) {
    throw unauthorized();
  }
}

function presentedToken(req) {
  const header = req.headers.get(TOKEN_HEADER) || '';
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return header || bearer;
}

/**
 * Guard for scheduled maintenance endpoints.
 *
 * Vercel Cron can only issue a GET carrying `Authorization: Bearer
 * $CRON_SECRET`, so it can't present the capture token. Accept either
 * credential — still fails closed, since CAPTURE_TOKEN must be configured
 * regardless and an absent CRON_SECRET simply means only the capture token
 * works.
 */
export function requireCaptureOrCronToken(req) {
  const expected = required('CAPTURE_TOKEN');
  const cronSecret = process.env.CRON_SECRET;
  const presented = presentedToken(req);

  if (!presented) throw unauthorized();
  if (safeEqual(presented, expected)) return;
  if (cronSecret?.trim() && safeEqual(presented, cronSecret)) return;

  throw unauthorized();
}

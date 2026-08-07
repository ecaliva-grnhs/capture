import { missingVars } from '@/lib/env';
import { jsonOk, route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Unauthenticated on purpose: it reports only *which* required variables are
 * absent, never any value. Because the app fails closed on a missing
 * CAPTURE_TOKEN, this is how you tell a misconfigured deploy apart from a
 * wrong token without having to read function logs.
 */
export const GET = route('GET /api/health', async () => {
  const missing = missingVars();
  return jsonOk(
    { ok: missing.length === 0, missing },
    missing.length === 0 ? 200 : 503
  );
});

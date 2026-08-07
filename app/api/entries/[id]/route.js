import { getSupabase } from '@/lib/supabase';
import { requireCaptureToken } from '@/lib/auth';
import { enrich } from '@/lib/enrich';
import { ENTRY_FIELDS } from '@/lib/ingest';
import { enforceRateLimit, bucketFor } from '@/lib/ratelimit';
import { safeUrl } from '@/lib/validate';
import { CONFIG } from '@/lib/env';
import { badRequest, notFound, jsonOk, route } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function entryId(params) {
  const id = params?.id;
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw badRequest('Invalid entry id.', 'bad_id');
  }
  return id;
}

/**
 * PATCH /api/entries/:id
 * Body: { body?: string, tags?: string[], summary?: string, url?: string }
 *
 * Edit an entry. Changing the body re-runs enrichment so the embedding stays
 * consistent with the text — otherwise semantic search would keep matching the
 * old wording. Explicitly supplied tags/summary win over the regenerated ones.
 */
export const PATCH = route('PATCH /api/entries/:id', async (req, { params }) => {
  requireCaptureToken(req);
  await enforceRateLimit(bucketFor(req, 'entries:patch'));

  const id = entryId(await params);

  let payload;
  try {
    payload = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON.', 'bad_json');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('Request body must be a JSON object.', 'bad_payload');
  }

  const db = getSupabase();
  const patch = {};

  if (payload.body !== undefined) {
    if (typeof payload.body !== 'string' || !payload.body.trim()) {
      throw badRequest('Field "body" cannot be empty.', 'empty_body');
    }
    const body = payload.body.trim();
    const max = CONFIG.maxBodyChars();
    if (body.length > max) {
      throw badRequest(
        `Field "body" exceeds the ${max} character limit.`,
        'body_too_long'
      );
    }
    patch.body = body;

    const enriched = await enrich(body);
    patch.tags = enriched.tags;
    patch.summary = enriched.summary;
    patch.embedding = enriched.embedding;
    patch.needs_enrichment = enriched.degraded;
  }

  if (payload.tags !== undefined) {
    if (
      !Array.isArray(payload.tags) ||
      payload.tags.some((t) => typeof t !== 'string')
    ) {
      throw badRequest('Field "tags" must be an array of strings.', 'bad_tags');
    }
    patch.tags = [
      ...new Set(
        payload.tags
          .map((t) => t.trim().toLowerCase().replace(/^#+/, '').slice(0, 40))
          .filter(Boolean)
      ),
    ].slice(0, 8);
  }

  if (payload.summary !== undefined) {
    if (payload.summary !== null && typeof payload.summary !== 'string') {
      throw badRequest('Field "summary" must be a string or null.', 'bad_summary');
    }
    patch.summary = payload.summary ? payload.summary.trim().slice(0, 300) : null;
  }

  if (payload.url !== undefined) {
    patch.url = payload.url === null ? null : safeUrl(payload.url);
  }

  if (Object.keys(patch).length === 0) {
    throw badRequest('No updatable fields supplied.', 'empty_patch');
  }

  const { data, error } = await db
    .from('entries')
    .update(patch)
    .eq('id', id)
    .select(ENTRY_FIELDS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw notFound('Entry not found.');

  return jsonOk({ entry: data });
});

/** DELETE /api/entries/:id */
export const DELETE = route(
  'DELETE /api/entries/:id',
  async (req, { params }) => {
    requireCaptureToken(req);
    await enforceRateLimit(bucketFor(req, 'entries:delete'));

    const id = entryId(await params);

    const { data, error } = await getSupabase()
      .from('entries')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound('Entry not found.');

    return jsonOk({ id: data.id, deleted: true });
  }
);

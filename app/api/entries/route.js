import { getSupabase } from '@/lib/supabase';
import { requireCaptureToken } from '@/lib/auth';
import { createEntry, ENTRY_FIELDS } from '@/lib/ingest';
import { enforceRateLimit, bucketFor } from '@/lib/ratelimit';
import { parseEntryPayload, parseCursor, parseLimit } from '@/lib/validate';
import { badRequest, jsonOk, route } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/entries
 * Headers: x-capture-token: <CAPTURE_TOKEN>   (or Authorization: Bearer …)
 * Body:    { body: string, source?: string, url?: string }
 *
 * Ingest a thought. Claude tags it and writes a one-line summary, Voyage
 * embeds it — but neither can prevent the save. Identical bodies captured
 * within DEDUPE_WINDOW_SEC collapse to the existing entry.
 */
export const POST = route('POST /api/entries', async (req) => {
  requireCaptureToken(req);
  await enforceRateLimit(bucketFor(req, 'entries:post'));

  let payload;
  try {
    payload = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON.', 'bad_json');
  }

  const { body, source, url } = parseEntryPayload(payload);
  const { entry, duplicate, degraded } = await createEntry({
    body,
    source,
    url,
  });

  // 200 for a collapsed duplicate, 201 for a genuinely new row.
  return jsonOk({ entry, duplicate, degraded }, duplicate ? 200 : 201);
});

/**
 * GET /api/entries?tag=…&limit=30&before=<iso>
 *
 * Reverse-chronological feed. Repeat `tag` to require all of them (matching
 * the AND semantics of search_entries).
 */
export const GET = route('GET /api/entries', async (req) => {
  requireCaptureToken(req);

  const { searchParams } = new URL(req.url);
  const tags = searchParams.getAll('tag').filter(Boolean);
  const before = parseCursor(searchParams.get('before'));
  const limit = parseLimit(searchParams.get('limit'), {
    fallback: 30,
    max: 100,
  });

  let query = getSupabase()
    .from('entries')
    .select(ENTRY_FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tags.length) query = query.contains('tags', tags);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;

  return jsonOk({
    entries: data,
    nextCursor: data.length === limit ? data[data.length - 1].created_at : null,
  });
});

import { getSupabase } from '@/lib/supabase';
import { requireCaptureToken } from '@/lib/auth';
import { embed } from '@/lib/embeddings';
import { enforceRateLimit, bucketFor } from '@/lib/ratelimit';
import { parseLimit, parseOffset } from '@/lib/validate';
import { badRequest, jsonOk, route } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * GET /api/search?q=…&tag=…&limit=20&offset=0
 *
 * Hybrid search: the query is embedded for semantic matching and passed as
 * text for full-text matching, and the two rankings are fused in Postgres.
 * That way "the thing about deadlines slipping" and an exact error string both
 * find their entry.
 *
 * If embedding fails, search degrades to full-text rather than erroring — a
 * partial result beats no result.
 */
export const GET = route('GET /api/search', async (req) => {
  requireCaptureToken(req);
  await enforceRateLimit(bucketFor(req, 'search'));

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const tags = searchParams.getAll('tag').filter(Boolean);
  const limit = parseLimit(searchParams.get('limit'), {
    fallback: 20,
    max: 50,
  });
  const offset = parseOffset(searchParams.get('offset'));

  if (!q) {
    throw badRequest('Query parameter "q" is required.', 'missing_query');
  }
  if (q.length > 500) {
    throw badRequest('Query is too long.', 'query_too_long');
  }

  let queryEmbedding = null;
  let semantic = true;
  try {
    queryEmbedding = await embed(q, 'query');
  } catch (err) {
    semantic = false;
    console.error('[search] embedding failed, falling back to full-text:', err);
  }

  const { data, error } = await getSupabase().rpc('search_entries', {
    query_embedding: queryEmbedding,
    query_text: q,
    match_count: limit,
    match_offset: offset,
    filter_tags: tags.length ? tags : null,
  });

  if (error) throw error;

  const entries = data || [];
  return jsonOk({
    entries,
    query: q,
    semantic,
    nextOffset: entries.length === limit ? offset + limit : null,
  });
});

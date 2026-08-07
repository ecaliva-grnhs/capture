import { getSupabase } from '@/lib/supabase';
import { requireCaptureOrCronToken } from '@/lib/auth';
import { enrich } from '@/lib/enrich';
import { parseLimit } from '@/lib/validate';
import { jsonOk, route } from '@/lib/http';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/maintenance/backfill?limit=10
 *
 * Repair entries that were saved while tagging or embedding was unavailable.
 * Without this, a degraded entry would keep its empty tags forever and — since
 * search only ranks rows that have an embedding — would be invisible to search
 * for good.
 *
 * Processes a small batch per call so it fits inside the function budget; call
 * it repeatedly (or from a cron) until `remaining` reaches zero.
 */
const handler = route('/api/maintenance/backfill', async (req) => {
  requireCaptureOrCronToken(req);

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get('limit'), { fallback: 10, max: 25 });

  const db = getSupabase();

  const { data: broken, error } = await db
    .from('entries')
    .select('id, body')
    .or('needs_enrichment.eq.true,embedding.is.null')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const results = [];
  for (const row of broken || []) {
    const { tags, summary, embedding, degraded } = await enrich(row.body);

    // Still failing? Leave the flag set so a later pass retries it.
    const patch = { needs_enrichment: degraded };
    if (tags.length) patch.tags = tags;
    if (summary) patch.summary = summary;
    if (embedding) patch.embedding = embedding;

    const { error: updateError } = await db
      .from('entries')
      .update(patch)
      .eq('id', row.id);

    results.push({
      id: row.id,
      repaired: !degraded && !updateError,
      error: updateError ? 'update_failed' : undefined,
    });

    if (updateError) console.error('[backfill] update failed:', updateError);
  }

  const { count } = await db
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .or('needs_enrichment.eq.true,embedding.is.null');

  return jsonOk({
    processed: results.length,
    repaired: results.filter((r) => r.repaired).length,
    remaining: count ?? null,
    results,
  });
});

// POST for manual runs; GET because Vercel Cron can only issue a GET.
export const POST = handler;
export const GET = handler;

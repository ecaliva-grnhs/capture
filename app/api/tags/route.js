import { getSupabase } from '@/lib/supabase';
import { requireCaptureToken } from '@/lib/auth';
import { jsonOk, route } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tags?tag=…
 *
 * Tag usage counts for the filter chips. When tags are already selected the
 * counts are computed over that subset, so a chip shows how many entries you'd
 * still have if you added it rather than a misleading global total.
 */
export const GET = route('GET /api/tags', async (req) => {
  requireCaptureToken(req);

  const { searchParams } = new URL(req.url);
  const tags = searchParams.getAll('tag').filter(Boolean);

  const { data, error } = await getSupabase().rpc('tag_counts', {
    filter_tags: tags.length ? tags : null,
  });

  if (error) throw error;
  return jsonOk({ tags: data || [] });
});

import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embed } from '@/lib/embeddings';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/search
 * Query params:
 *   - q:     the search query (required)
 *   - tag:   repeatable; restrict results to entries overlapping these tags
 *   - limit: max results (default 20, max 50)
 *
 * Semantic search: embed the query, then rank stored entries by cosine
 * similarity via the match_entries() RPC.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const tags = searchParams.getAll('tag').filter(Boolean);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1),
    50
  );

  if (!q) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required.' },
      { status: 400 }
    );
  }

  try {
    const queryEmbedding = await embed(q, 'query');

    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('match_entries', {
      query_embedding: queryEmbedding,
      match_count: limit,
      filter_tags: tags.length ? tags : null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: data || [], query: q });
  } catch (err) {
    console.error('GET /api/search failed:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

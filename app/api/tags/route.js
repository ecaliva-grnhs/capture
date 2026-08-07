import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * GET /api/tags
 * Distinct tags with usage counts, most-used first — powers the filter chips.
 */
export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('tag_counts');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tags: data || [] });
  } catch (err) {
    console.error('GET /api/tags failed:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

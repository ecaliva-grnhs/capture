import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { autoTag } from '@/lib/anthropic';
import { embed } from '@/lib/embeddings';

// Auto-tagging + embedding both hit external APIs; give them room.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Optional shared-secret guard for the ingest endpoint.
 *
 * The app has no user auth, but a public write endpoint still shouldn't be
 * open to the world. If INGEST_SECRET is set, POSTs must send it as a Bearer
 * token (or `x-ingest-secret` header) — easy to configure in an Apple
 * Shortcut. If it's unset, the endpoint is open (fine for local dev).
 */
function authorized(req) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const header = req.headers.get('x-ingest-secret') || '';
  return bearer === secret || header === secret;
}

/**
 * POST /api/entries
 * Body: { body: string, source?: string, url?: string }
 *
 * Called by the Apple Shortcut. Generates tags + a one-line summary with
 * Claude, embeds the body with Voyage, and inserts the row.
 */
export async function POST(req) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body = typeof payload?.body === 'string' ? payload.body.trim() : '';
  if (!body) {
    return NextResponse.json(
      { error: 'Field "body" is required.' },
      { status: 400 }
    );
  }

  const source =
    typeof payload?.source === 'string' && payload.source.trim()
      ? payload.source.trim()
      : 'shortcut';
  const url =
    typeof payload?.url === 'string' && payload.url.trim()
      ? payload.url.trim()
      : null;

  try {
    // Enrich (tags + summary) and embed in parallel — they're independent.
    const [{ tags, summary }, embedding] = await Promise.all([
      autoTag(body),
      embed(body, 'document'),
    ]);

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('entries')
      .insert({ body, tags, summary, source, url, embedding })
      .select('id, body, tags, summary, source, url, created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/entries failed:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/entries
 * Query params:
 *   - tag:    repeatable; filter to entries containing ALL given tags
 *   - limit:  page size (default 30, max 100)
 *   - before: ISO timestamp cursor for reverse-chron pagination
 *
 * Reverse-chronological feed.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const tags = searchParams.getAll('tag').filter(Boolean);
  const before = searchParams.get('before');
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') || '30', 10) || 30, 1),
    100
  );

  try {
    const supabase = getSupabase();
    let query = supabase
      .from('entries')
      .select('id, body, tags, summary, source, url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tags.length) {
      // `contains` => entries whose tags array includes all requested tags.
      query = query.contains('tags', tags);
    }
    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const nextCursor =
      data.length === limit ? data[data.length - 1].created_at : null;

    return NextResponse.json({ entries: data, nextCursor });
  } catch (err) {
    console.error('GET /api/entries failed:', err);
    return NextResponse.json(
      { error: err.message || 'Internal error' },
      { status: 500 }
    );
  }
}

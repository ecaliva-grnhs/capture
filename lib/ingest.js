import { createHash } from 'node:crypto';
import { getSupabase } from './supabase.js';
import { enrich as realEnrich } from './enrich.js';
import { CONFIG } from './env.js';
import { ApiError } from './errors.js';

export const ENTRY_FIELDS =
  'id, body, tags, summary, source, url, created_at, updated_at, needs_enrichment';

/** Mirrors the generated `body_hash` column so we can look up before writing. */
export function bodyHash(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * Create an entry.
 *
 * Order of operations matters: de-duplicate first (cheap, avoids paying for
 * enrichment on a double-tapped Shortcut), then enrich, then insert. Because
 * enrich() never throws, the insert always runs — a capture is only lost if
 * the database itself is unreachable.
 *
 * Dependencies are injected so this is testable without network or database.
 */
export async function createEntry(
  { body, source, url },
  { supabase = null, enrich = realEnrich, now = () => new Date() } = {}
) {
  const db = supabase || getSupabase();

  const hash = bodyHash(body);
  const since = new Date(
    now().getTime() - CONFIG.dedupeWindowSec() * 1000
  ).toISOString();

  const { data: dupe, error: dupeError } = await db
    .from('entries')
    .select(ENTRY_FIELDS)
    .eq('body_hash', hash)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // A failed duplicate check shouldn't block the capture; worst case we store
  // the thought twice, which is strictly better than dropping it.
  if (dupeError) {
    console.error('[ingest] duplicate check failed:', dupeError);
  } else if (dupe) {
    return { entry: dupe, duplicate: true, degraded: false };
  }

  const { tags, summary, embedding, degraded } = await enrich(body);

  const { data, error } = await db
    .from('entries')
    .insert({
      body,
      tags,
      summary,
      source,
      url,
      embedding,
      needs_enrichment: degraded,
    })
    .select(ENTRY_FIELDS)
    .single();

  if (error) {
    console.error('[ingest] insert failed:', error);
    throw new ApiError(503, 'Could not save entry. Please retry.', 'db_write');
  }

  return { entry: data, duplicate: false, degraded };
}

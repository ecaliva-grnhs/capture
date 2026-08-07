import { autoTag as realAutoTag } from './anthropic.js';
import { embed as realEmbed } from './embeddings.js';

/**
 * Enrichment that cannot fail.
 *
 * Capturing a thought must never depend on a third party being up. Tagging and
 * embedding run concurrently and are settled independently: whichever succeeds
 * is used, whichever fails degrades to null and is logged. The caller always
 * gets a usable result and the entry always gets saved.
 *
 * `degraded` is true when either arm failed, which flags the row for the
 * backfill pass in /api/maintenance/backfill.
 */
export async function enrich(
  body,
  { autoTag = realAutoTag, embed = realEmbed, logger = console } = {}
) {
  const [tagged, embedded] = await Promise.allSettled([
    autoTag(body),
    embed(body, 'document'),
  ]);

  let tags = [];
  let summary = null;
  let embedding = null;
  const failures = [];

  if (tagged.status === 'fulfilled') {
    tags = tagged.value?.tags ?? [];
    summary = tagged.value?.summary ?? null;
  } else {
    failures.push('tagging');
    logger.error('[enrich] tagging failed:', tagged.reason);
  }

  if (embedded.status === 'fulfilled') {
    embedding = embedded.value;
  } else {
    failures.push('embedding');
    logger.error('[enrich] embedding failed:', embedded.reason);
  }

  return { tags, summary, embedding, degraded: failures.length > 0, failures };
}

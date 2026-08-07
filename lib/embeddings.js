// Text embeddings via Voyage AI (Anthropic ships no embeddings endpoint).
//
// `voyage-3.5` outputs 1024-dimensional vectors, matching the vector(1024)
// column in supabase/schema.sql. Changing the model means changing both.

import { CONFIG, required } from './env.js';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';

export const EMBEDDING_DIMENSIONS = 1024;

/**
 * Embed a single piece of text. Throws on failure — callers that must not
 * fail should use the `safe` wrapper in lib/enrich.js.
 *
 * @param {string} text
 * @param {'document'|'query'} inputType Voyage optimises asymmetric search
 *   when told whether the text is a stored document or a search query.
 */
export async function embed(text, inputType = 'document', { signal } = {}) {
  const apiKey = required('VOYAGE_API_KEY');

  // Always bound the request, even when the caller passes no signal — a bare
  // fetch has no timeout and would hang until the platform kills the function.
  const timeout = AbortSignal.timeout(CONFIG.enrichTimeoutMs());
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.voyageModel(),
      input: [text],
      input_type: inputType,
    }),
    signal: composed,
  });

  if (!res.ok) {
    // Body may echo request detail; keep it in the server log only.
    const detail = await res.text().catch(() => '');
    const err = new Error(`Voyage embedding failed (${res.status})`);
    err.detail = detail;
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const vector = json?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Voyage returned an unexpected embedding (expected ${EMBEDDING_DIMENSIONS} dims).`
    );
  }
  return vector;
}

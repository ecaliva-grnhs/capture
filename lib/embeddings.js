// Text embeddings via Voyage AI (Anthropic's recommended embedding provider).
//
// `voyage-3.5` outputs 1024-dimensional vectors by default, which matches the
// vector(1024) column in supabase/schema.sql. If you change the model or
// dimension, update the schema to match.

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const MODEL = process.env.VOYAGE_MODEL || 'voyage-3.5';

/**
 * Embed a single piece of text.
 * @param {string} text
 * @param {'document'|'query'} inputType  Voyage optimizes asymmetric search
 *   when you tell it whether the text is a stored document or a search query.
 * @returns {Promise<number[]>}
 */
export async function embed(text, inputType = 'document') {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing VOYAGE_API_KEY environment variable.');
  }

  const res = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: [text],
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voyage embedding failed (${res.status}): ${detail}`);
  }

  const json = await res.json();
  const vector = json?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error('Voyage returned an unexpected response shape.');
  }
  return vector;
}

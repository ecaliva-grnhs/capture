import { badRequest } from './errors.js';
import { CONFIG } from './env.js';

/**
 * Only http/https URLs are storable. The feed renders `url` as a clickable
 * link, so allowing arbitrary schemes would turn a captured entry into a
 * `javascript:` payload waiting for a tap.
 */
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw badRequest('Field "url" must be a valid absolute URL.', 'bad_url');
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    throw badRequest('Field "url" must use http or https.', 'bad_url_scheme');
  }
  return parsed.toString();
}

/** Validate and normalise the ingest payload. */
export function parseEntryPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw badRequest('Request body must be a JSON object.', 'bad_payload');
  }

  const raw = payload.body;
  if (typeof raw !== 'string') {
    throw badRequest('Field "body" is required.', 'missing_body');
  }

  const body = raw.trim();
  if (!body) {
    throw badRequest('Field "body" cannot be empty.', 'empty_body');
  }

  const max = CONFIG.maxBodyChars();
  if (body.length > max) {
    throw badRequest(
      `Field "body" exceeds the ${max} character limit.`,
      'body_too_long'
    );
  }

  const source =
    typeof payload.source === 'string' && payload.source.trim()
      ? payload.source.trim().slice(0, 64)
      : 'shortcut';

  return { body, source, url: safeUrl(payload.url) };
}

/** Parse a `created_at` pagination cursor, rejecting garbage with a 400. */
export function parseCursor(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw badRequest(
      'Query parameter "before" must be an ISO-8601 timestamp.',
      'bad_cursor'
    );
  }
  return new Date(ms).toISOString();
}

/** Parse a bounded integer query parameter. */
export function parseLimit(value, { fallback, max, min = 1 }) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) {
    throw badRequest('Query parameter "limit" must be an integer.', 'bad_limit');
  }
  return Math.min(Math.max(n, min), max);
}

export function parseOffset(value, { max = 1000 } = {}) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) {
    throw badRequest(
      'Query parameter "offset" must be a non-negative integer.',
      'bad_offset'
    );
  }
  return Math.min(n, max);
}

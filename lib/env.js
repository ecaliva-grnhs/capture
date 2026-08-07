import { unavailable } from './errors.js';

/**
 * Centralised environment access.
 *
 * Every secret this app needs is required. There is no "unset means open"
 * path — a missing variable is a configuration error that surfaces loudly at
 * the first request rather than silently disabling a protection.
 */

export const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'VOYAGE_API_KEY',
  'CAPTURE_TOKEN',
];

/**
 * Read a required variable, throwing if absent or blank.
 *
 * Throws a 503 rather than a bare Error so a misconfigured deployment is
 * distinguishable from a genuine crash. The variable's name is safe to return
 * (GET /api/health lists them anyway); its value never is.
 */
export function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw unavailable(
      'Server is not configured. See GET /api/health.',
      'not_configured'
    );
  }
  return value;
}

/** Read an optional variable with a default. */
export function optional(name, fallback) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Names of any missing required variables. Used by the health check so a
 * misconfigured deploy is visible without having to trigger a real capture.
 */
export function missingVars() {
  return REQUIRED_VARS.filter((name) => {
    const value = process.env[name];
    return typeof value !== 'string' || !value.trim();
  });
}

// Tunables — safe defaults, overridable per-deployment.
export const CONFIG = {
  claudeModel: () => optional('CLAUDE_MODEL', 'claude-haiku-4-5-20251001'),
  voyageModel: () => optional('VOYAGE_MODEL', 'voyage-3.5'),
  // Enrichment must finish well inside the function budget so a slow upstream
  // degrades into an untagged save instead of a lost capture.
  enrichTimeoutMs: () =>
    Number(optional('ENRICH_TIMEOUT_MS', '9000')) || 9000,
  maxBodyChars: () => Number(optional('MAX_BODY_CHARS', '20000')) || 20000,
  rateLimitMax: () => Number(optional('RATE_LIMIT_MAX', '60')) || 60,
  rateLimitWindowSec: () =>
    Number(optional('RATE_LIMIT_WINDOW_SEC', '60')) || 60,
  // Identical bodies captured inside this window collapse to one entry.
  dedupeWindowSec: () => Number(optional('DEDUPE_WINDOW_SEC', '300')) || 300,
};

'use client';

/**
 * Browser-side API helper.
 *
 * The API is token-guarded, so the PWA holds the same capture token the Apple
 * Shortcut uses. "Single user, no auth" means no accounts and no login flow —
 * not an open database. The token is entered once and kept in localStorage.
 */

const TOKEN_KEY = 'thought-capture.token';
export const TOKEN_HEADER = 'x-capture-token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode — the session still works, it just won't persist */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Thrown when the network is unavailable, so callers can queue instead. */
export class OfflineError extends Error {
  constructor() {
    super('You appear to be offline.');
    this.name = 'OfflineError';
  }
}

export async function apiFetch(path, { method = 'GET', body, signal } = {}) {
  const token = getToken();
  const headers = {};
  if (token) headers[TOKEN_HEADER] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new OfflineError();
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      json?.error || `Request failed (${res.status})`,
      json?.code
    );
  }
  return json;
}

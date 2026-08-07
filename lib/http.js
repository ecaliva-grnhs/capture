import { NextResponse } from 'next/server';
import { ApiError } from './errors.js';

export {
  ApiError,
  badRequest,
  unauthorized,
  notFound,
  tooManyRequests,
  unavailable,
} from './errors.js';

export function jsonOk(payload, status = 200, headers) {
  return NextResponse.json(payload, { status, headers });
}

/**
 * Convert a thrown value into a response.
 *
 * Only ApiError messages reach the client. Everything else — Supabase errors,
 * missing-env errors, upstream response bodies — is logged server-side and
 * answered with a generic 500, so infrastructure detail never leaks.
 */
export function jsonError(err, context) {
  if (err instanceof ApiError) {
    const body = { error: err.message };
    if (err.code) body.code = err.code;
    return NextResponse.json(body, { status: err.status });
  }

  console.error(`[${context}]`, err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

/** Wrap a route handler so no unexpected throw escapes as a raw message. */
export function route(context, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      return jsonError(err, context);
    }
  };
}

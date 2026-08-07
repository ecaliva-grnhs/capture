/**
 * Error types shared by route handlers and the modules beneath them.
 *
 * Deliberately free of any `next/*` import so the validation, auth and ingest
 * layers can be unit-tested outside the Next runtime.
 */

/** An error whose message is safe to return to the caller verbatim. */
export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (msg, code) => new ApiError(400, msg, code);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const tooManyRequests = (msg = 'Rate limit exceeded') =>
  new ApiError(429, msg);
export const unavailable = (msg = 'Service unavailable', code) =>
  new ApiError(503, msg, code);

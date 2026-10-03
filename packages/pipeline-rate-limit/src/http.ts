/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RateLimitExceededError } from './errors/rate-limit-exceeded.error.js';

/** An HTTP answer for an error: status, JSON body and headers. */
export interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * The HTTP answer for a {@link RateLimitExceededError}: `429 Too Many Requests` with a
 * `Retry-After` header. Framework filters and Express handlers reply with it.
 *
 * @example
 * ```ts
 * app.use((error, _req, res, next) => {
 *   if (!(error instanceof RateLimitExceededError)) return next(error);
 *   const { status, body, headers } = toHttpResponse(error);
 *   res.status(status).set(headers).json(body);
 * });
 * ```
 */
export function toHttpResponse(error: RateLimitExceededError): HttpResponse {
  return {
    status: 429,
    body: {
      statusCode: 429,
      error: 'Too Many Requests',
      message: error.message,
      retryAfter: error.retryAfterSeconds,
    },
    headers: { 'Retry-After': String(error.retryAfterSeconds) },
  };
}

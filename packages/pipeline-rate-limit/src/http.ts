/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { HttpResponse } from '@cqrs-ddd/pipeline';
import { RateLimitExceededError } from './errors/rate-limit-exceeded.error.js';

export type { HttpResponse };

/**
 * The HTTP answer for a {@link RateLimitExceededError}: `429 Too Many Requests` with a
 * `Retry-After` header. Framework filters and Express handlers reply with it.
 * The body never carries the bucket key, which holds the tenant and the caller.
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
      message: `Rate limit exceeded; retry after ${error.retryAfterSeconds}s`,
      retryAfter: error.retryAfterSeconds,
    },
    headers: { 'Retry-After': String(error.retryAfterSeconds) },
  };
}

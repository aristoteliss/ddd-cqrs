/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { HttpResponse } from '@cqrs-ddd/pipeline';
import type { IdempotencyConflictError } from './errors/idempotency-conflict.error.js';

export type { HttpResponse };

const ANSWERS = {
  in_progress: {
    statusCode: 409,
    error: 'Conflict',
    message: 'A request with this idempotency key is already in progress',
  },
  replay_scope: {
    statusCode: 409,
    error: 'Conflict',
    message:
      'This idempotency key holds a response authorized under a different scope; it cannot be replayed',
  },
  key_reuse: {
    statusCode: 422,
    error: 'Unprocessable Entity',
    message: 'This idempotency key was already used with a different payload',
  },
} as const;

/**
 * The HTTP answer for an {@link IdempotencyConflictError}: `409 Conflict` for an
 * operation in progress or a different replay scope, `422 Unprocessable Entity` for a
 * key reused with another payload. The body carries the `reason` and never the stored
 * key, which holds the tenant and the principal.
 *
 * @example
 * ```ts
 * const { status, body } = toHttpResponse(error);
 * res.status(status).json(body);
 * ```
 */
export function toHttpResponse(error: IdempotencyConflictError): HttpResponse {
  const answer = ANSWERS[error.reason];
  return {
    status: answer.statusCode,
    body: { ...answer, reason: error.reason },
    headers: {},
  };
}

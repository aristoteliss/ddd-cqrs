/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IdempotencyConflictError } from './errors/idempotency-conflict.error.js';

/** An HTTP answer for an error: status, JSON body and headers. */
export interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * The HTTP answer for an {@link IdempotencyConflictError}: `409 Conflict` for an
 * operation in progress or a different replay scope, `422 Unprocessable Entity` for a
 * key reused with another payload.
 *
 * @example
 * ```ts
 * const { status, body } = toHttpResponse(error);
 * res.status(status).json(body);
 * ```
 */
export function toHttpResponse(error: IdempotencyConflictError): HttpResponse {
  return {
    status: error.statusCode,
    body: {
      statusCode: error.statusCode,
      error: error.statusCode === 409 ? 'Conflict' : 'Unprocessable Entity',
      message: error.message,
      idempotencyKey: error.key,
      reason: error.reason,
    },
    headers: {},
  };
}

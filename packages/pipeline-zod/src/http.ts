/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { HttpResponse } from '@cqrs-ddd/pipeline';
import type { ZodValidationError } from './errors/zod-validation.error.js';

export type { HttpResponse };

/**
 * The HTTP answer for a {@link ZodValidationError}: `400 Bad Request` with the issue
 * details.
 *
 * @example
 * ```ts
 * const { status, body } = toHttpResponse(error);
 * res.status(status).json(body);
 * ```
 */
export function toHttpResponse(error: ZodValidationError): HttpResponse {
  return {
    status: 400,
    body: {
      statusCode: 400,
      error: 'Bad Request',
      message: error.message,
      details: error.details,
    },
    headers: {},
  };
}

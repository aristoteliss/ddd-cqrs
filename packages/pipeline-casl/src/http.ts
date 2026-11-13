/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { HttpResponse } from '@cqrs-ddd/pipeline';
import type { UnauthorizedActionException } from './errors/unauthorized-action.exception.js';

export type { HttpResponse };

/**
 * The HTTP answer for an {@link UnauthorizedActionException}: `403 Forbidden`, naming the
 * denied action and subject.
 *
 * @example
 * ```ts
 * const { status, body } = toHttpResponse(error);
 * res.status(status).json(body);
 * ```
 */
export function toHttpResponse(
  error: UnauthorizedActionException,
): HttpResponse {
  return {
    status: 403,
    body: {
      statusCode: 403,
      error: 'Forbidden',
      message: error.message,
      action: error.action,
      subject: error.subject,
    },
    headers: {},
  };
}

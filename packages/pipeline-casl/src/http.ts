/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { UnauthorizedActionException } from './errors/unauthorized-action.exception.js';

/** An HTTP answer for an error: status, JSON body and headers. */
export interface HttpResponse {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

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

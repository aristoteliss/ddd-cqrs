/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { HttpResponse } from '@cqrs-ddd/pipeline';
import type { FeatureDisabledError } from './errors/feature-disabled.error.js';

export type { HttpResponse };

/**
 * The HTTP answer for a {@link FeatureDisabledError}: `403 Forbidden` naming the flag, or
 * with `hideFeature` a plain `404 Not Found` that does not reveal the feature exists.
 *
 * @example
 * ```ts
 * const { status, body } = toHttpResponse(error, { hideFeature: true });
 * res.status(status).json(body);
 * ```
 */
export function toHttpResponse(
  error: FeatureDisabledError,
  options: { hideFeature?: boolean } = {},
): HttpResponse {
  if (options.hideFeature) {
    return {
      status: 404,
      body: { statusCode: 404, error: 'Not Found', message: 'Not Found' },
      headers: {},
    };
  }
  return {
    status: 403,
    body: {
      statusCode: 403,
      error: 'Forbidden',
      message: error.message,
      flag: error.flag,
    },
    headers: {},
  };
}

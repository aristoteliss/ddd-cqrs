/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_CORRELATION_HEADER } from '../constants/correlation.constants.js';
import { correlationSource, getCorrelationId } from '../correlation.store.js';
import type { CorrelationOptions } from '../options/correlation.options.js';
import { admit, assertMaxLength } from '../policy/correlation.policy.js';

const HTTP_FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** A Node `http` middleware: Express and Connect take it as it is. */
export type HttpMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

/**
 * An HTTP middleware that takes the correlation id from the incoming request header and
 * runs the rest of the request with it ({@link runWithCorrelationId}), so pipelines
 * that the request starts take it. It echoes the id on the response header.
 *
 * The header name defaults to `x-correlation-id`. If `header` is omitted or is any
 * non-string value (including `false`), the default header is used.
 *
 * An incoming id that the rules `configureCorrelation` sets reject (by default, longer
 * than 128 characters or outside the default character set) is replaced by a local id
 * and reported to `onRejected` with the source `'http'`. `acceptIncoming`,
 * `trimIncoming`, `maxLength` and `validateIncoming` adjust that policy for this
 * middleware. None of them lets through an id that is not printable ASCII or that starts
 * or ends with a space.
 *
 * @throws TypeError when `header` is not a valid HTTP field name, or `maxLength` is not
 *   a positive safe integer.
 * @example Express
 * ```ts
 * app.use(httpCorrelation({ trimIncoming: true, validateIncoming: (id) => id.startsWith('edge:') }));
 * ```
 */
export function httpCorrelation(options?: CorrelationOptions): HttpMiddleware {
  const h = options?.header;
  if (typeof h === 'string' && !HTTP_FIELD_NAME.test(h)) {
    throw new TypeError(`Invalid correlation HTTP header name: "${h}".`);
  }
  assertMaxLength(options?.maxLength);

  const header =
    typeof h === 'string' ? h.toLowerCase() : DEFAULT_CORRELATION_HEADER;
  const resolveIncoming = incomingResolver(options);

  return (req, res, next) => {
    const raw = req.headers?.[header];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    const correlationId = resolveIncoming(candidate) ?? getCorrelationId();
    if (typeof res?.setHeader === 'function') {
      res.setHeader(header, correlationId);
    }
    correlationSource.run(correlationId, next);
  };
}

/** Returns an incoming id the options accept, else `undefined`. */
function incomingResolver(
  options?: CorrelationOptions,
): (raw: string | undefined) => string | undefined {
  const acceptIncoming = options?.acceptIncoming ?? true;
  const trimIncoming = options?.trimIncoming ?? false;
  const overrides = {
    maxLength: options?.maxLength,
    validateIncoming: options?.validateIncoming,
  };

  return (raw) => {
    if (!acceptIncoming || typeof raw !== 'string') return undefined;
    return admit(trimIncoming ? raw.trim() : raw, 'http', 'checked', overrides);
  };
}

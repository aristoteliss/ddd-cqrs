/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { DEFAULT_CORRELATION_HEADER } from '../constants/correlation.constants.js';
import {
  getCorrelationId,
  runWithCorrelationId,
} from '../correlation.store.js';
import {
  type CorrelationOptions,
  DEFAULT_CORRELATION_ID_MAX_LENGTH,
  DEFAULT_CORRELATION_ID_PATTERN,
} from '../options/correlation.options.js';

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
 * An incoming id longer than 128 characters or outside the default character set is
 * replaced by a local id. `acceptIncoming`, `trimIncoming`, `maxLength` and
 * `validateIncoming` adjust that policy.
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
  if (
    options?.maxLength !== undefined &&
    (!Number.isSafeInteger(options.maxLength) || options.maxLength <= 0)
  ) {
    throw new TypeError(
      'Correlation maxLength must be a positive safe integer when provided.',
    );
  }

  const header =
    typeof h === 'string' ? h.toLowerCase() : DEFAULT_CORRELATION_HEADER;
  const acceptIncoming = options?.acceptIncoming ?? true;
  const trimIncoming = options?.trimIncoming ?? false;
  const maxLength = options?.maxLength ?? DEFAULT_CORRELATION_ID_MAX_LENGTH;
  const validateIncoming =
    options?.validateIncoming ??
    ((id: string) => DEFAULT_CORRELATION_ID_PATTERN.test(id));

  const resolveIncoming = (raw: string | undefined): string | undefined => {
    if (!acceptIncoming || typeof raw !== 'string') return undefined;
    const value = trimIncoming ? raw.trim() : raw;
    if (value.length === 0 || value.length > maxLength) return undefined;
    try {
      return validateIncoming(value) ? value : undefined;
    } catch {
      return undefined;
    }
  };

  return (req, res, next) => {
    const raw = req.headers?.[header];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    const correlationId = resolveIncoming(candidate) ?? getCorrelationId();
    if (typeof res?.setHeader === 'function') {
      res.setHeader(header, correlationId);
    }
    runWithCorrelationId(correlationId, next);
  };
}

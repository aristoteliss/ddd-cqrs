/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IncomingMessage, ServerResponse } from 'node:http';
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

/**
 * HTTP middleware that extracts a correlation ID from the incoming request header and
 * runs the rest of the request with it ({@link runWithCorrelationId}), so pipelines
 * that the request starts take it. Its `use(req, res, next)` fits Node's `http`
 * server, Express and Connect; `@nestjs-pipeline/correlation` registers it in NestJS.
 *
 * The header name defaults to `x-correlation-id`. If `header` is omitted or is any
 * non-string value (including `false`), the default header is used.
 *
 * An incoming ID longer than 128 characters or outside the default character set is
 * replaced by a local ID. `acceptIncoming`, `trimIncoming`, `maxLength` and
 * `validateIncoming` adjust that policy.
 *
 * @throws TypeError when `header` is not a valid HTTP field name.
 * @example Express
 * ```ts
 * const correlation = new HttpCorrelationMiddleware({
 *   trimIncoming: true,
 *   validateIncoming: (id) => id.startsWith('edge:'),
 * });
 * app.use((req, res, next) => correlation.use(req, res, next));
 * ```
 */
export class HttpCorrelationMiddleware {
  private readonly header: string;
  private readonly acceptIncoming: boolean;
  private readonly trimIncoming: boolean;
  private readonly maxLength: number;
  private readonly validateIncoming: (correlationId: string) => boolean;

  constructor(options?: CorrelationOptions) {
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

    this.header =
      typeof h === 'string' ? h.toLowerCase() : DEFAULT_CORRELATION_HEADER;
    this.acceptIncoming = options?.acceptIncoming ?? true;
    this.trimIncoming = options?.trimIncoming ?? false;
    this.maxLength = options?.maxLength ?? DEFAULT_CORRELATION_ID_MAX_LENGTH;
    this.validateIncoming =
      options?.validateIncoming ??
      ((id) => DEFAULT_CORRELATION_ID_PATTERN.test(id));
  }

  use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const raw = req.headers?.[this.header];
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    const correlationId = this.resolveIncoming(candidate) ?? getCorrelationId();

    if (typeof res?.setHeader === 'function') {
      res.setHeader(this.header, correlationId);
    }

    runWithCorrelationId(correlationId, next);
  }

  /** Applies configured validation/normalization to one incoming header value. */
  private resolveIncoming(raw: string | undefined): string | undefined {
    if (!this.acceptIncoming || typeof raw !== 'string') {
      return undefined;
    }

    const value = this.trimIncoming ? raw.trim() : raw;
    if (value.length === 0) return undefined;

    if (value.length > this.maxLength) return undefined;

    try {
      if (!this.validateIncoming(value)) return undefined;
    } catch {
      return undefined;
    }

    return value;
  }
}

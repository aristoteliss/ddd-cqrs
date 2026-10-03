/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IncomingMessage } from 'node:http';
import { HEADERS } from '../../common/constants/headers.constants.js';
import { HttpError } from '../../http/http-error.js';
import { tenantSchema } from '../persistence.config.js';
import type { TenantSchemaContext } from '../tenant-schema.context.js';
import { InvalidTenantSchemaError } from '../tenant-schema.errors.js';

/**
 * Runs each request in the tenant its `x-tenant-schema` header names. A request without
 * the header, or for a tenant that is not configured, answers 403; a malformed name, 400.
 *
 * @example
 * ```ts
 * const tenant = new TenantSchemaMiddleware(new TenantSchemaContext(), new Set(config.tenants));
 * requestContext(logger, [(req, res, next) => tenant.use(req, res, next)]);
 * ```
 */
export class TenantSchemaMiddleware {
  constructor(
    private readonly context: TenantSchemaContext,
    private readonly tenants: ReadonlySet<string>,
  ) {}

  /**
   * @throws HttpError 403 without a tenant header or for an unknown tenant, 400 for a
   *   malformed one.
   */
  use(
    request: Pick<IncomingMessage, 'headers'> | { headers?: undefined },
    _response: unknown,
    next: () => void,
  ): void {
    const raw = request.headers?.[HEADERS.TENANT_SCHEMA];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header) {
      throw new HttpError(
        403,
        'Tenant context is required to process this request.',
      );
    }
    const schema = parse(header);
    if (!this.tenants.has(schema)) {
      throw new HttpError(403, 'Unknown tenant context.');
    }
    this.context.run(schema, () => next());
  }
}

function parse(header: string): string {
  try {
    return tenantSchema(header);
  } catch (error) {
    if (error instanceof InvalidTenantSchemaError) {
      throw new HttpError(400, error.message);
    }
    throw error;
  }
}

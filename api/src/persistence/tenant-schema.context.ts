/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import { currentTenantId, runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { tenantSchema } from './persistence.config.js';

/**
 * The tenant schema of the running request or job: the tenant of
 * `@cqrs-ddd/pipeline-tenant`, validated as a schema name. It fails closed outside a
 * tenant instead of falling back to a default one.
 *
 * @example
 * ```ts
 * const tenants = new TenantSchemaContext();
 * tenants.run('tenant_a', () => store.em); // the entity manager of tenant_a
 * ```
 */
export class TenantSchemaContext {
  /**
   * Runs `callback` in `schema`, for everything it calls.
   *
   * @throws MissingTenantContextError when `schema` is `undefined`.
   * @throws InvalidTenantSchemaError when `schema` is not a valid schema name.
   */
  run<T>(schema: string | undefined, callback: () => T): T {
    if (schema === undefined) {
      throw new MissingTenantContextError('a tenant-scoped run');
    }
    return runWithTenant(tenantSchema(schema), callback);
  }

  /**
   * The schema of the running tenant.
   *
   * @throws MissingTenantContextError outside a tenant.
   * @throws InvalidTenantSchemaError when the tenant is not a valid schema name.
   */
  get schema(): string {
    const schema = currentTenantId();
    if (schema === undefined) {
      throw new MissingTenantContextError('reading the active tenant');
    }
    return tenantSchema(schema);
  }
}

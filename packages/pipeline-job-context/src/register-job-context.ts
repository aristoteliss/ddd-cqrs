/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { register, unregister } from './helpers/registration.js';
import type { JobContextSources } from './interfaces/context-source.interface.js';
import type { IJobPrincipal } from './interfaces/job-principal.interface.js';

/** What {@link registerJobContext} makes the job context of the process. */
export interface JobContextOptions {
  /** Restores and re-checks the principal of a job, and declares system principals. */
  principal: IJobPrincipal;
  /** The tenants a job may run in; a job that names another is refused. */
  tenants: readonly string[];
  /**
   * Where the tenant and the correlation id are stamped from and restored into, such as
   * `tenantSource` of `@cqrs-ddd/pipeline-tenant` and `correlationSource` of
   * `@cqrs-ddd/pipeline-correlation`.
   */
  sources: JobContextSources;
}

/**
 * Makes `options` the job context of this process: `withJobContext` stamps payloads
 * with it, `@InJobContext()` restores it, and `@AsSystem` declares system principals
 * through it. One application registers it once, at startup.
 *
 * @returns A function that removes this registration, for shutdown.
 * @throws TypeError when `tenants` is empty.
 * @example
 * ```ts
 * const unregister = registerJobContext({
 *   principal: new SessionJobPrincipal(sessions),
 *   tenants: ['acme', 'globex'],
 *   sources: { tenantId: tenantSource, correlationId: correlationSource },
 * });
 * process.on('SIGTERM', unregister);
 * ```
 */
export function registerJobContext(options: JobContextOptions): () => void {
  if (options.tenants.length === 0) {
    throw new TypeError('registerJobContext needs at least one tenant.');
  }
  const registration = {
    principal: options.principal,
    tenants: [...options.tenants],
    sources: options.sources,
  };
  register(registration);
  return () => unregister(registration);
}

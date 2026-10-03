/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  cache,
  createPartitionedCacheKeyFactory,
} from '@cqrs-ddd/pipeline-cache';
import { currentTenantId, tenantSource } from '@cqrs-ddd/pipeline-tenant';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

/**
 * The pipeline of the example. Executions take their tenant from
 * `@cqrs-ddd/pipeline-tenant`, so `runWithTenant()` scopes every call inside it.
 */
export const pipeline = createPipeline({
  behaviors: [new CacheBehavior(buildCache({}))],
  sources: { tenantId: tenantSource },
});

const perTenant = createPartitionedCacheKeyFactory({
  principal: () => 'public',
  requireScope: false,
});

const Reprice = z.object({
  sku: z.string().min(1),
  price: z.coerce.number().int().positive(),
});

/**
 * Prices per tenant. `price()` is a cached query whose key carries the tenant, so a
 * call without a tenant fails instead of sharing an entry; `reprice()` is a command
 * that receives its input parsed by Zod.
 *
 * @example
 * ```ts
 * const catalog = new Catalog();
 * await runWithTenant('acme', () => catalog.reprice({ sku: 'apple', price: '120' }));
 * await runWithTenant('acme', () => catalog.price('apple')); // 120
 * ```
 */
export class Catalog {
  readonly reads: string[] = [];
  readonly #prices = new Map<string, number>();

  @pipeline.wrap({ kind: 'query' }, cache({ key: perTenant, ttl: 60_000 }))
  async price(sku: string): Promise<number | undefined> {
    this.reads.push(`${currentTenantId()}/${sku}`);
    return this.#prices.get(`${currentTenantId()}/${sku}`);
  }

  @pipeline.wrap({ kind: 'command' }, validated(Reprice))
  async reprice(input: z.input<typeof Reprice>): Promise<void> {
    const { sku, price } = input as z.output<typeof Reprice>;
    this.#prices.set(`${currentTenantId()}/${sku}`, price);
  }
}

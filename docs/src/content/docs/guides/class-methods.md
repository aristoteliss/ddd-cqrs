---
title: Class methods
description: Decorate methods with pipeline.wrap() using TypeScript standard decorators, with a cache partitioned by tenant.
sidebar:
  order: 2
---

This guide decorates the methods of a class with `@pipeline.wrap()` as standard
decorators: a cached query whose key carries the tenant, and a command whose input Zod
parses. The [DDD guide](/ddd-cqrs/guides/ddd/) uses the same wrapper with
`experimentalDecorators`; one implementation serves both modes.

## Compiling decorators

Node.js runs TypeScript by stripping types, but it cannot strip decorator syntax, so the
code compiles with `tsc`. `experimentalDecorators: false` selects standard decorators:

```json
{
  "compilerOptions": {
    "experimentalDecorators": false,
    "emitDecoratorMetadata": false
  }
}
```

## The pipeline

Executions take their tenant from `@cqrs-ddd/pipeline-tenant`, so `runWithTenant()`
scopes every call inside it.

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

export const pipeline = createPipeline({
  behaviors: [new CacheBehavior(buildCache({}))],
  sources: { tenantId: tenantSource },
});
```

## A cached query and a validated command

The cache key of `price()` is partitioned by tenant, so two tenants never share an entry,
and a call without a tenant fails instead of reading a shared one. `reprice()` receives
its input parsed by Zod. The methods are named `Catalog.price` and `Catalog.reprice`, from
the class and the method; the `kind` option says what each does.

```ts
import { cache, createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const perTenant = createPartitionedCacheKeyFactory({
  principal: () => 'public',
  requireScope: false,
});

const Reprice = z.object({
  sku: z.string().min(1),
  price: z.coerce.number().int().positive(),
});

export class Catalog {
  readonly #prices = new Map<string, number>();

  @pipeline.wrap({ kind: 'query' }, cache({ key: perTenant, ttl: 60_000 }))
  async price(sku: string): Promise<number | undefined> {
    return this.#prices.get(`${currentTenantId()}/${sku}`);
  }

  @pipeline.wrap({ kind: 'command' }, validated(Reprice))
  async reprice(input: z.input<typeof Reprice>): Promise<void> {
    const { sku, price } = input as z.output<typeof Reprice>;
    this.#prices.set(`${currentTenantId()}/${sku}`, price);
  }
}
```

## Two tenants

`runWithTenant()` sets the tenant for everything it calls:

```ts
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';

const catalog = new Catalog();
await runWithTenant('acme', () => catalog.reprice({ sku: 'apple', price: '120' }));
await runWithTenant('globex', () => catalog.reprice({ sku: 'apple', price: 95 }));

await runWithTenant('acme', () => catalog.price('apple')); // 120
await runWithTenant('globex', () => catalog.price('apple')); // 95
await catalog.price('apple'); // rejects with MissingCachePartitionError
```

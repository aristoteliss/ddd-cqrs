---
title: "@cqrs-ddd/pipeline-cache"
description: "Result caching on cache-manager and Keyv stores, with keys partitioned by tenant, principal and permission scope."
sidebar:
  order: 12
---

Caches composed query results on [cache-manager](https://github.com/jaredwray/cacheable) and Keyv backends: memory, Redis, Memcache, SQLite, PostgreSQL, or multi-tier combinations.

A cache hit returns the stored result immediately without executing the underlying handler or its internal entity checks. To prevent data leakage across users or privilege tiers, cache keys must partition by tenant, principal, and permission scope.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-cache @cqrs-ddd/pipeline cache-manager keyv
```

Install optional Keyv adapters for external storage:
- Redis: `@keyv/redis`
- PostgreSQL: `@keyv/postgres`
- SQLite: `@keyv/sqlite`
- Memcache: `@keyv/memcache`

## Two Cache Layers in `@cqrs-ddd`

`@cqrs-ddd` separates caching into two distinct, complementary layers:

1. **Pipeline Result Caching (`@cqrs-ddd/pipeline-cache`)**: The use case/query handler level. Caches composed, projected view models and DTOs. Owns security boundaries (tenant, principal, permission scope) and freshness policies.
2. **Repository Snapshot Caching (`@FromCache`, `@Cache` in `@cqrs-ddd/core`)**: The persistence level. Caches serialized entity snapshots using CAS version comparisons (`isCacheNewer`) and mutation barriers.

Invalidating a persistence entity does not implicitly invalidate composed query responses; each layer manages its own lifecycle.

## Usage

### 1. Plain Node.js / Pipeline Engine

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  cache,
  createPartitionedCacheKeyFactory,
} from '@cqrs-ddd/pipeline-cache';

// Initialize cache with Redis backend
const cacheStore = buildCache({
  store: { type: 'redis', url: process.env.REDIS_URL, namespace: 'query_cache' },
  ttl: 60_000,
});

const pipeline = createPipeline({
  behaviors: [new CacheBehavior(cacheStore)],
});

// Construct secure partitioned key factory
const orderListKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string,
  scope: (ctx) => ctx.items.get('userRolesHash') as string,
  includeTenant: true,
});

export const getOrders = pipeline.wrap(
  { name: 'getOrders', kind: 'query' },
  cache({ key: orderListKey, ttl: 30_000 }),
)(async (filter: OrderFilterDto) => ordersService.listOrders(filter));
```

### 2. NestJS Integration (`@cqrs-ddd/nestjs`)

Register `CacheBehavior` as a provider in your infrastructure module:

```typescript
import { Module } from '@nestjs/common';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';

@Module({
  providers: [
    {
      provide: CacheBehavior,
      useFactory: () => {
        return new CacheBehavior(
          buildCache({
            store: { type: 'redis', url: process.env.REDIS_URL },
            ttl: 60_000,
          }),
        );
      },
    },
  ],
  exports: [CacheBehavior],
})
export class CacheModule {}
```

Decorate `@QueryHandler` with `cache()`:

```typescript
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { cache } from '@cqrs-ddd/pipeline-cache';

@QueryHandler(GetCatalogQuery)
@UsePipeline(cache({ key: catalogKeyFactory, ttl: 120_000 }))
export class GetCatalogHandler implements IQueryHandler<GetCatalogQuery> {
  async execute(query: GetCatalogQuery) {
    return this.catalog.load(query);
  }
}
```

## Storage Backends & Multi-Tier Caching

`buildCache(options)` configures single or multi-tier storage:

```typescript
// Multi-tier: Fast in-memory L1 cache with Redis L2 fallback
const multiTierCache = buildCache({
  store: [
    { type: 'memory', ttl: 10_000 },
    { type: 'redis', url: process.env.REDIS_URL, ttl: 300_000 },
  ],
  nonBlocking: true, // Non-blocking reads across tiers
});
```

| Store Type | Required Package | Best Used For |
| --- | --- | --- |
| `'memory'` | Built-in | L1 in-process caching, testing, dev environments |
| `'redis'` | `@keyv/redis` | Distributed L2 caching, high-throughput microservices |
| `'postgres'` | `@keyv/postgres` | Relational environments without dedicated Redis infrastructure |
| `'sqlite'` | `@keyv/sqlite` | Embedded desktop/CLI or edge applications |
| `'memcache'` | `@keyv/memcache` | High-volume simple key-value stores |

## Partitioned Key Construction & Security Boundaries

Short-circuit keys are a critical security boundary. Serving a cached result bypasses all internal entity-level and field-level permission checks. 

Always partition keys by tenant, principal, and permission scope:

```typescript
import { createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { abilityDigest, getCaslPrincipal } from '@cqrs-ddd/pipeline-casl';

export const userProfileKey = createPartitionedCacheKeyFactory({
  principal: (ctx) => getCaslPrincipal(ctx)?.id,
  scope: abilityDigest, // Hashes caller's CASL capability set
  includeTenant: true,
  requireTenant: true,
  requirePrincipal: true,
  requireScope: true,
});
```

| Factory Option | Type | Default | Description |
| --- | --- | --- | --- |
| `principal` | `(ctx) => string \| undefined` | required | Identifies the caller. Throws `MissingCachePartitionError` if missing and required. |
| `scope` | `(ctx) => string \| undefined` | `undefined` | Fingerprint of permissions (role hash or `abilityDigest`). |
| `requirePrincipal` | `boolean` | `true` | When `true`, missing principal throws fail-closed error. Set to `false` only for public queries. |
| `requireScope` | `boolean` | `true` | When `true`, missing permission scope throws. Set to `false` only for unprivileged queries. |
| `includeTenant` | `boolean` | `true` | Prepends active tenant ID to the cache key segment. |
| `requireTenant` | `boolean` | value of `includeTenant` | Enforces active tenant presence in execution context. |

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `CacheKeyFactory` | required | Computes cache key from pipeline context. |
| `ttl` | `number` | Cache default | Time-to-live for cached entry in milliseconds. |
| `kinds` | `DeclaredKind[]` | `['query']` | Request kinds the cache applies to (typically queries only). |
| `condition` | `(ctx) => boolean \| Promise<boolean>` | `undefined` | Predicate determining whether this specific request should check/populate cache. |
| `failOpen` | `boolean` | `true` | When `true`, underlying store failures log a warning and proceed without cache. When `false`, store errors throw. |

## Observability & Attributes

`CacheBehavior` records runtime items in `context.items`:
- `CACHE_HIT_ITEM_TOKEN`: Boolean indicating whether the result was served from cache.
- `CACHE_KEY_ITEM_TOKEN`: String key under which the entry was retrieved or written.

Convert them into tracing or metrics attributes with `buildCacheAttributes(context)`.

## Behavior Ordering

Position `CacheBehavior` **after** validation and authorization:
1. `ZodValidationBehavior`: Normalizes and validates request parameters.
2. `CaslBehavior`: Verifies type-level authorization.
3. `CacheBehavior`: Checks cache key with authenticated principal and permission scope.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-cache/)

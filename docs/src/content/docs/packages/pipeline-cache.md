---
title: "@cqrs-ddd/pipeline-cache"
description: "Result caching on cache-manager and Keyv stores, with keys partitioned by tenant, principal and permission scope."
sidebar:
  order: 12
---

Caches the results of queries on [cache-manager](https://github.com/jaredwray/cacheable)
and Keyv stores: memory, Redis, Memcache, SQLite, PostgreSQL, or several in tiers. A cache
hit returns the stored result without running the operation, and without running any
check inside it. Keys must therefore separate everything that can change the answer;
`createPartitionedCacheKeyFactory()` builds such keys.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-cache @cqrs-ddd/pipeline cache-manager keyv
```

A store other than memory needs its Keyv adapter, an optional peer dependency:
`@keyv/redis`, `@keyv/memcache`, `@keyv/sqlite` or `@keyv/postgres`.

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  cache,
  createPartitionedCacheKeyFactory,
} from '@cqrs-ddd/pipeline-cache';

const pipeline = createPipeline({
  behaviors: [new CacheBehavior(buildCache({ store: { type: 'redis', url: redisUrl } }))],
});

const perUser = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string | undefined,
  scope: (ctx) => ctx.items.get('rolesVersion') as string | undefined,
});

export const getOrders = pipeline.wrap(
  { name: 'getOrders', kind: 'query' },
  cache({ key: perUser, ttl: 30_000 }),
)(async (filter: OrderFilter) => orders.find(filter));
```

The behavior's constructor takes a cache-manager `Cache` (or an `IPipelineCache`, any
object with `get` and `set`), optional defaults for every operation, and an optional
logger.

## Building the cache

`buildCache(options)` returns a cache-manager `Cache`:

| Option | Meaning |
| --- | --- |
| `store` | one store configuration or a list, tiered in order: `{ type, url, namespace, ttl, options }`, with `type` one of `memory`, `redis`, `memcache`, `sqlite`, `postgres` |
| `stores` | prebuilt Keyv instances, which it does not modify |
| `cache` | a prebuilt cache, used as it is |
| `ttl` | default time to live in milliseconds |
| `nonBlocking` | forwarded to cache-manager, for several stores |

With none of them, the cache is in memory. `buildKeyv()` builds one Keyv store.

## Partitioned keys

`createPartitionedCacheKeyFactory(options)` builds a key from the tenant, the principal,
the permission scope, the operation name and a digest of the request:

| Option | Meaning | Default |
| --- | --- | --- |
| `principal` | the caller the answer is for | required |
| `scope` | a fingerprint of the caller's permissions, such as a role-set hash | none |
| `requirePrincipal` | a missing principal throws instead of being left out | `true` |
| `requireScope` | a missing scope throws instead of being left out | `true` |
| `includeTenant` | the key starts with the execution's tenant | `true` |
| `requireTenant` | a missing tenant throws | the value of `includeTenant` |

A missing required part throws `MissingCachePartitionError`. Set `requirePrincipal` and
`requireScope` to `false` only for answers that are the same for every caller.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `key` | the key factory; required when the behavior runs | none |
| `ttl` | time to live of the entries, in milliseconds | the cache's |
| `kinds` | request kinds that are cached | `['query']` |
| `condition` | a predicate that decides per execution whether to cache | none |
| `failOpen` | when the store fails, continue without the cache instead of throwing | `true` |

`cache({ inheritModuleKey: true, ttl })` takes the key factory from the constructor
defaults.

## Ordering

The cache orders itself after `CaslBehavior` when both are present, so a cached answer is
never served to a caller the authorization check would refuse. Validation should run
before it, so the key sees the parsed request.

`CACHE_HIT_ITEM_TOKEN` and `CACHE_KEY_ITEM_TOKEN` tell later behaviors whether the answer
came from the cache and under which key; `buildCacheAttributes` turns them into trace or
audit attributes.

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-cache/)

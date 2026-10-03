# @cqrs-ddd/pipeline-cache

Result caching for `@cqrs-ddd/pipeline` on [cache-manager](https://github.com/jaredwray/cacheable)
and Keyv stores (memory, Redis, Memcache, SQLite, PostgreSQL, tiered). `buildCache()`
creates the cache from a store configuration; `createPartitionedCacheKeyFactory()`
builds keys partitioned by tenant, principal and permission scope, because a cache hit
skips the function and every check inside it.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-cache/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-cache/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-cache @cqrs-ddd/pipeline cache-manager keyv
```

Add `@keyv/redis`, `@keyv/memcache`, `@keyv/sqlite` or `@keyv/postgres` for those stores.
Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({
  behaviors: [new CacheBehavior(buildCache({ store: { type: 'redis', url: redisUrl } }), { ttl: 30_000 })],
});

export const getPrice = pipeline.wrap(
  { name: 'getPrice', kind: 'query' },
  cache({ key: createPartitionedCacheKeyFactory({ principal: currentUserId, requireScope: false }) }),
)(async (sku: string) => prices.find(sku));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.

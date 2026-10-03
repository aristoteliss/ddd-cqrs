---
title: Multi-tenancy
description: Carry the tenant of each request or job through pipelines, repositories and cache keys, and fail closed when it is missing.
sidebar:
  order: 9
---

A tenant is set once, where work enters the application, and read everywhere else from
`AsyncLocalStorage`. Every behavior and helper that keys data by tenant fails closed when
it needs one and there is none, so two tenants never share a cache entry, an idempotency
record or a rate-limit bucket.

## Setting the tenant

`runWithTenant(tenantId, fn)` of `@cqrs-ddd/pipeline-tenant` sets the tenant for
everything `fn` calls, synchronously or asynchronously; `currentTenantId()` reads it. An
HTTP middleware or a queue consumer sets it at the edge, from what authenticated the work:

```ts
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';

server.use((req, res, next) => runWithTenant(req.auth.tenantId, next));
```

The tenant comes from a verified credential, never from a header or a body field the
client chooses freely. [HTTP with Express and Fastify](/ddd-cqrs/guides/http/) shows the
middleware in place, and [Background jobs](/ddd-cqrs/guides/background-jobs/) how a job
runs in the tenant of the request that enqueued it.

## Pipelines

A pipeline takes each execution's tenant from its `tenantId` source, once, when the
execution starts:

```ts
import { tenantSource } from '@cqrs-ddd/pipeline-tenant';

createCqrs({ sources: { tenantId: tenantSource } }); // or createPipeline({ sources })
```

`context.tenantId` is that tenant, and everything the chain calls, nested pipelines and
`currentTenantId()` included, sees it. See [The pipeline context](/ddd-cqrs/concepts/context/).

## Keys partitioned by tenant

The key factories of the cache, idempotency and rate-limit packages put the tenant first
in every key, and throw when it is missing:

| Factory | Key | Error without a tenant |
| --- | --- | --- |
| `createPartitionedCacheKeyFactory({ principal, scope })` | tenant, principal, permission scope, request | `MissingCachePartitionError` |
| `createPartitionedIdempotencyKeyFactory({ action, principal, operation })` | version, tenant, principal, action, operation | `MissingIdempotencyPartitionError` |
| `createPartitionedRateLimitKeyFactory(partition)` | tenant, caller, request | `MissingRateLimitPartitionError` |

```ts
import { cache, createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';
import { abilityDigest } from '@cqrs-ddd/pipeline-casl';

const perCaller = createPartitionedCacheKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string | undefined,
  scope: (ctx) => abilityDigest(ctx),
});

@QueryHandler(GetOrdersQuery)
@UsePipeline(cache({ key: perCaller, ttl: 30_000 }))
class GetOrdersHandler {}
```

`includeTenant: false` leaves the tenant out, for data that is the same in every tenant,
such as a public price list. A missing tenant is an error of the application, not of the
request: it answers 500, and the [HTTP error mappings](/ddd-cqrs/guides/http-errors/)
leave it unmapped.

## Repositories and the domain

`@cqrs-ddd/core` reads the tenant through a resolver the application registers once, at
startup. Pointing it at the pipeline's tenant gives the repository cache keys
(`cacheKey`, `cacheKeyTemplate`) and `requireTenant()` the same tenant as the behaviors:

```ts
import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';

setTenantResolver(currentTenantId);
```

Code that needs the tenant for a security-sensitive purpose calls
`requireTenant(purpose)`, which returns it or throws `MissingTenantContextError` naming the
purpose. It never falls back to a shared default:

```ts
import { requireTenant } from '@cqrs-ddd/core/application';

const tenantId = requireTenant('access token issuance');
```

`domainErrorHttpStatus()` of `@cqrs-ddd/core/http` answers `MissingTenantContextError`
with 500, without its message.

## Testing

A test runs tenant-scoped work inside `runWithTenant()`, as a request would, and can
assert that work outside it fails:

```ts
await runWithTenant('acme', () => queries.execute(new GetOrdersQuery()));
await expect(queries.execute(new GetOrdersQuery())).rejects.toThrow(MissingCachePartitionError);
```

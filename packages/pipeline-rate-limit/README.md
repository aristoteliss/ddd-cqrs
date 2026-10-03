# @cqrs-ddd/pipeline-rate-limit

Rate limiting for `@cqrs-ddd/pipeline`, on any limiter with a `consume()` method such as
those of [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible)
(memory, Redis, PostgreSQL). `createPartitionedRateLimitKeyFactory()` builds keys
partitioned by tenant, principal and operation; `toHttpResponse()` from
`@cqrs-ddd/pipeline-rate-limit/http` turns a refusal into a 429 answer with `Retry-After`.

**Documentation:** [guide](https://aristoteliss.github.io/ddd-cqrs/packages/pipeline-rate-limit/) · [API reference](https://aristoteliss.github.io/ddd-cqrs/api/cqrs-ddd/pipeline-rate-limit/) · [all packages](https://aristoteliss.github.io/ddd-cqrs/)

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-rate-limit @cqrs-ddd/pipeline rate-limiter-flexible
```

Requires Node.js 22.12 or later. Published as an ES module; a CommonJS application loads
it with `require()`.

## Example

```ts
const pipeline = createPipeline({
  behaviors: [new RateLimitBehavior(new RateLimiterMemory({ points: 10, duration: 60 }))],
});

export const search = pipeline.wrap(
  { name: 'search', kind: 'query' },
  rateLimit({ keyFactory: createPartitionedRateLimitKeyFactory(currentUserId) }),
)(async (term: string) => catalog.search(term));
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See `LICENSE` and
`COMMERCIAL_LICENSE.txt`.

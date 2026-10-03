---
title: "@cqrs-ddd/pipeline-rate-limit"
description: "Rate limits for wrapped functions and methods on any limiter with a consume() method, with keys partitioned by tenant and caller."
sidebar:
  order: 14
---

Limits how often an operation runs. The behavior works with any limiter that has a
`consume()` method, such as those of
[rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) (memory,
Redis, PostgreSQL and more). A request over the limit is refused before the operation runs.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-rate-limit @cqrs-ddd/pipeline rate-limiter-flexible
```

`rate-limiter-flexible` is not a dependency of the package; any limiter that satisfies
`RateLimiterLike` works.

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createPartitionedRateLimitKeyFactory,
  RateLimitBehavior,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const pipeline = createPipeline({
  behaviors: [new RateLimitBehavior(new RateLimiterMemory({ points: 10, duration: 60 }))],
});

const perUser = createPartitionedRateLimitKeyFactory(
  (ctx) => ctx.items.get('userId') as string | undefined,
);

export const search = pipeline.wrap(
  { name: 'search', kind: 'query' },
  rateLimit({ keyFactory: perUser }),
)(async (term: string) => catalog.search(term));
```

The behavior's constructor takes the limiter, optional defaults for every operation and an
optional logger.

## Partitioned keys

`createPartitionedRateLimitKeyFactory(partition, options)` builds the key
`<tenant>:<partition>:<requestName>` from a function that returns the caller's identity:

| Option | Meaning | Default |
| --- | --- | --- |
| `onMissingPartition` | `'throw'` refuses a request whose caller is unknown; `'request'` falls back to one bucket for every caller of the operation | `'throw'` |
| `includeTenant`, `requireTenant` | the tenant segment, as for the other keyed behaviors | `true` |

A missing required part throws `MissingRateLimitPartitionError`.

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `keyFactory` | the key factory; required when the behavior runs | none |
| `points` | what one request costs: a number, or a function of the context; `0` costs nothing | `1` |
| `keyPrefix` | prepended to the key as `<prefix>:<key>` | none |
| `limiter` | a limiter for this operation instead of the constructor's | the constructor's |
| `failOpen` | when the limiter's store fails, let the request through instead of refusing it | `true` |

`rateLimit({ inheritModuleKey: true })` takes the key factory from the constructor
defaults.

`RATE_LIMIT_ITEM_TOKEN` gives later behaviors the limiter's decision;
`buildRateLimitAttributes` turns it into trace or audit attributes.

## HTTP errors

A refusal throws `RateLimitExceededError`, with `retryAfterSeconds`, `remainingPoints` and
the key. `toHttpResponse(error)` from `@cqrs-ddd/pipeline-rate-limit/http` returns a 429
answer with a `Retry-After` header. See [HTTP errors](/ddd-cqrs/guides/http-errors/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-rate-limit/)

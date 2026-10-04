---
title: "@cqrs-ddd/pipeline-rate-limit"
description: "Rate limits for wrapped functions and methods on any limiter with a consume() method, with keys partitioned by tenant and caller."
sidebar:
  order: 14
---

Enforces throughput throttling and quota policies across distributed microservices. Works with any limiter exposing a `consume()` method, including [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) (Redis, Memory, PostgreSQL, MySQL).

Over-quota requests are rejected before executing business logic, throwing `RateLimitExceededError` which translates to HTTP 429 Too Many Requests with a calculated `Retry-After` header.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-rate-limit @cqrs-ddd/pipeline rate-limiter-flexible
```

Compatible with all `rate-limiter-flexible` adapters (`RateLimiterRedis`, `RateLimiterMemory`, `RateLimiterPostgres`, `RateLimiterCluster`).

## Usage Patterns

### 1. Plain Node.js / Pipeline Engine

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createPartitionedRateLimitKeyFactory,
  RateLimitBehavior,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const limiter = new RateLimiterRedis({
  storeClient: redis,
  points: 100,      // 100 points
  duration: 60,     // per 60 seconds
  keyPrefix: 'rl',
});

const pipeline = createPipeline({
  behaviors: [new RateLimitBehavior(limiter)],
});

// Partition by authenticated user, failing closed if user context is missing
const perUserKey = createPartitionedRateLimitKeyFactory(
  (ctx) => ctx.items.get('userId') as string,
  { onMissingPartition: 'throw', includeTenant: true },
);

export const searchCatalog = pipeline.wrap(
  { name: 'searchCatalog', kind: 'query' },
  rateLimit({ keyFactory: perUserKey, points: 1 }),
)(async (term: string) => catalog.search(term));
```

### 2. NestJS Integration (`@cqrs-ddd/nestjs`)

Provide `RateLimitBehavior` in your rate-limiting or security module:

```typescript
import { Module } from '@nestjs/common';
import { RateLimitBehavior } from '@cqrs-ddd/pipeline-rate-limit';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { RedisService } from '../redis/redis.service.js';

@Module({
  providers: [
    {
      provide: RateLimitBehavior,
      inject: [RedisService],
      useFactory: (redis: RedisService) => {
        const limiter = new RateLimiterRedis({
          storeClient: redis.client,
          points: 50,
          duration: 60,
        });
        return new RateLimitBehavior(limiter);
      },
    },
  ],
  exports: [RateLimitBehavior],
})
export class RateLimitModule {}
```

Decorate command or query handlers:

```typescript
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { rateLimit } from '@cqrs-ddd/pipeline-rate-limit';

@CommandHandler(SendVerificationCodeCommand)
@UsePipeline(rateLimit({ keyFactory: verificationKeyFactory, points: 5 }))
export class SendVerificationCodeHandler implements ICommandHandler<SendVerificationCodeCommand> {
  async execute(command: SendVerificationCodeCommand) {
    // Throttled execution
  }
}
```

The global `ErrorFilter` automatically maps `RateLimitExceededError` to HTTP 429 Too Many Requests and sets the `Retry-After: <seconds>` response header.

## Dynamic Points Consumption

Requests can consume varying point costs based on execution weight (e.g. batch operations consume points proportional to array length):

```typescript
@UsePipeline(
  rateLimit({
    keyFactory: perUserKey,
    points: (ctx) => {
      const command = ctx.request as BatchImportCommand;
      return Math.max(1, command.items.length); // 1 point per batch item
    },
  }),
)
export class BatchImportHandler {}
```

## Partitioned Key Construction

`createPartitionedRateLimitKeyFactory(partitionFn, options)` builds composite keys in the format `<tenant>:<partition>:<requestName>`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `onMissingPartition` | `'throw' \| 'request'` | `'throw'` | When `'throw'`, requests lacking an identified caller fail closed with `MissingRateLimitPartitionError`. When `'request'`, unidentified callers share one bucket per request and tenant. |
| `includeTenant` | `boolean` | `true` | Prepends active tenant ID to prevent cross-tenant quota contention. |
| `requireTenant` | `boolean` | `includeTenant` | Throws `MissingRateLimitPartitionError` if tenant context is missing. |

Generated key examples:
- Authenticated user: `org_123:usr_456:searchCatalog`
- IP address: `org_123:ip_192.168.1.1:searchCatalog`

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `keyFactory` | `RateLimitKeyFactory` | required | Key factory returning the partition string. |
| `points` | `number \| ((ctx) => number)` | `1` | Point cost consumed by this request, a non-negative safe integer. `0` charges nothing: the limiter is not called. |
| `keyPrefix` | `string` | `undefined` | Additional prefix prepended to the generated key. |
| `limiter` | `RateLimiterLike` | Constructor limiter | Override the default limiter for this specific operation. |
| `failOpen` | `boolean` | `true` | When `true`, limiter backend errors (Redis offline) log a warning and let the request proceed. When `false`, backend failures reject. |

## Observability & Pipeline Items

`RateLimitBehavior` stamps limiter decisions onto `context.items`:
- `RATE_LIMIT_ITEM_TOKEN`: the limiter's result, with the remaining points and the milliseconds before the next point.
- `buildRateLimitAttributes(context)`: `{ 'rate_limit.remaining_points': n }`, for span or metric attributes.

## HTTP Error Translation

When points are exhausted, `RateLimitExceededError` is thrown:

```typescript
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { toHttpResponse } from '@cqrs-ddd/pipeline-rate-limit/http';

try {
  await searchCatalog(term);
} catch (error) {
  if (!(error instanceof RateLimitExceededError)) throw error;
  const { status, body, headers } = toHttpResponse(error);
  // status: 429
  // body: { statusCode: 429, error: 'Too Many Requests', message, retryAfter: 12 }
  // headers: { 'Retry-After': '12' }
}
```

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-rate-limit/)

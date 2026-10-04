---
title: "@cqrs-ddd/pipeline-idempotency"
description: "Run a command once per operation key, replay the stored response to duplicates, and refuse a key reused with another request."
sidebar:
  order: 13
---

Makes command execution idempotent across distributed services. A command runs exactly once per operation key; duplicate invocations receive the stored response without re-executing side effects; reusing the same key with an altered request payload is rejected with HTTP 422 Unprocessable Entity.

Includes built-in stores for in-memory testing, Redis, and PostgreSQL with support for permission-scoped replay verification.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-idempotency @cqrs-ddd/pipeline
```

The stores take a client the application installs and connects:
- Redis: a node-redis client (`redis` 4 or later)
- PostgreSQL: a `pg` pool or client

## State Machine & Execution Lifecycle

`IdempotencyBehavior` coordinates execution states through atomic store transactions:

```text
Incoming Command (Key = K)
         │
         ▼
Check Store for Key K
         │
         ├─ Key does not exist ─────────────► Acquire Lock (Status: 'in_progress')
         │                                            │
         │                                            ▼
         │                                     Execute Handler Pipeline
         │                                            │
         │                                     Success?
         │                                     ├─ Yes: Save Response & Status: 'completed'
         │                                     └─ No:  Release Key (if releaseOnError: true)
         │
         ├─ Key exists & Status is 'in_progress'
         │      └─► Reject with IdempotencyConflictError (reason: 'in_progress', HTTP 409)
         │
         └─ Key exists & Status is 'completed'
                │
                ├─ Request payload fingerprint does NOT match
                │      └─► Reject with IdempotencyConflictError (reason: 'key_reuse', HTTP 422)
                │
                ├─ Replay scope digest does NOT match
                │      └─► Reject with IdempotencyConflictError (reason: 'replay_scope', HTTP 409)
                │
                └─ All checks pass
                       └─► Return stored response immediately (no handler execution)
```

## Usage

### 1. Plain Node.js / Pipeline Engine

```typescript
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createPartitionedIdempotencyKeyFactory,
  IdempotencyBehavior,
  idempotent,
  RedisIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const pipeline = createPipeline({
  behaviors: [new IdempotencyBehavior(new RedisIdempotencyStore(redis))],
});

const paymentKey = createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string,
  operation: (ctx) => ctx.items.get('idempotencyKey') as string,
  onMissingOperation: 'skip',
  includeTenant: false, // a single-tenant service; keep the default to partition by tenant
});

export const chargePayment = pipeline.wrap(
  { name: 'chargePayment', kind: 'command' },
  idempotent({ keyFactory: paymentKey, ttl: 86_400_000 }),
)(async (payment: PaymentDto) => paymentGateway.charge(payment));
```

### 2. Standalone CQRS (`@cqrs-ddd/cqrs`)

```typescript
import { CommandHandler, ICommandHandler } from '@cqrs-ddd/cqrs';
import { UsePipeline } from '@cqrs-ddd/pipeline';
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';

@CommandHandler(CreateInvoiceCommand)
@UsePipeline(idempotent({ keyFactory: invoiceKeyFactory }))
export class CreateInvoiceHandler implements ICommandHandler<CreateInvoiceCommand> {
  async execute(command: CreateInvoiceCommand) {
    return this.invoices.create(command);
  }
}
```

### 3. NestJS (`@cqrs-ddd/nestjs`)

```typescript
import { Module } from '@nestjs/common';
import { IdempotencyBehavior, RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';
import { RedisService } from './redis.service.js';

@Module({
  providers: [
    {
      provide: IdempotencyBehavior,
      inject: [RedisService],
      useFactory: (redis: RedisService) =>
        new IdempotencyBehavior(new RedisIdempotencyStore(redis.client)),
    },
  ],
  exports: [IdempotencyBehavior],
})
export class ReliabilityModule {}
```

## Storage Backends

### Memory Store (`MemoryIdempotencyStore`)

Suitable for unit tests and single-node development:

```typescript
import { MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new MemoryIdempotencyStore({
  cleanupIntervalMs: 60_000,
});

// Teardown in tests:
store.destroy();
```

### Redis Store (`RedisIdempotencyStore`)

Production-ready distributed store using atomic Redis commands:

```typescript
import { RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new RedisIdempotencyStore(redisClient, {
  keyPrefix: 'idemp:', // default 'idempotency:'
});
```

### PostgreSQL Store (`PostgresIdempotencyStore`)

Stores idempotency records directly within PostgreSQL for systems requiring relational consistency:

```typescript
import {
  PostgresIdempotencyStore,
  createIdempotencyTableSql,
} from '@cqrs-ddd/pipeline-idempotency';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// 1. Run migration during initial setup:
await pool.query(createIdempotencyTableSql('idempotency_keys'));

// 2. Initialize store:
const store = new PostgresIdempotencyStore(pool, {
  table: 'idempotency_keys', // the default; `schema.table` is accepted
});
```

## Partitioned Key Construction

Idempotency keys must be strictly isolated by tenant and principal to prevent cross-tenant or cross-user key collision attacks:

```typescript
const keyFactory = createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => getUserId(ctx),
  operation: (ctx) => getHeader(ctx, 'idempotency-key'),
  onMissingOperation: 'throw',
  action: 'payments.charge',
  version: 'v1',
  includeTenant: true,
  requireTenant: true,
});
```

| Factory Option | Type | Default | Description |
| --- | --- | --- | --- |
| `principal` | `(ctx) => string \| string[] \| undefined` | required | Identifies the caller, from authenticated context. A missing principal always throws `MissingIdempotencyPartitionError`. |
| `operation` | `(ctx) => string \| undefined` | required | Unique client operation ID (e.g. from an HTTP `Idempotency-Key` header). |
| `onMissingOperation` | `'throw' \| 'skip'` | `'throw'` | When `'throw'`, requests lacking an operation ID fail fast. When `'skip'`, the handler runs without idempotency tracking. |
| `action` | `string` | `ctx.requestName` | Logical operation name embedded in the key. |
| `version` | `string` | `undefined` | Leading namespace segment. Changing it abandons every stored claim. |
| `includeTenant` | `boolean` | `true` | Prepends active tenant ID to the key. |
| `requireTenant` | `boolean` | `includeTenant` | Throws `MissingIdempotencyPartitionError` if tenant context is missing. |

Generated key pattern, each segment escaped so no value can make two operations collide:
```text
[version:]<tenantId>:<principal…>:<action>:<operation>
```

## Security & Replay Scope Verification

A cache or idempotency hit returns stored data without invoking the underlying handler or its internal entity authorization checks.

To prevent privilege escalation when authorization rules change between requests, supply a `replayScopeFactory`:

```typescript
import { abilityDigest } from '@cqrs-ddd/pipeline-casl';

idempotent({
  keyFactory,
  replayScopeFactory: abilityDigest,
  ttl: 86_400_000,
});
```

If the caller's permissions have changed between the initial execution and the duplicate request, the stored replay digest will not match. The request is rejected with `IdempotencyConflictError` (`reason: 'replay_scope'`, HTTP 409 Conflict) rather than replaying unauthorized response data. The record is neither deleted nor executed again, so a permission change never runs the side effect twice; a record stored without a digest fails the same way.

## Configuration Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `keyFactory` | `IdempotencyKeyFactory` | required | Key factory returning the partition string. |
| `ttl` | `number` | `86_400_000` (24h) | Time-to-live for completed idempotency records in milliseconds. |
| `scope` | `DeclaredKind[]` | `['command']` | Request kinds the behavior applies to. |
| `fingerprint` | `boolean` | `true` | Compares a SHA-256 hash of the request payload. A mismatch throws `key_reuse` (422). |
| `replayScopeFactory` | `IdempotencyReplayScopeFactory` | `undefined` | Computes authorization digest for safe replays. |
| `releaseOnError` | `boolean` | `true` | Deletes the pending lock when the handler throws, allowing clients to retry immediately. |

## HTTP Error Translation

`IdempotencyConflictError` translates to HTTP responses via `@cqrs-ddd/pipeline-idempotency/http`:

| Conflict Reason | HTTP Status | Description |
| --- | --- | --- |
| `in_progress` | 409 Conflict | An execution with the same key is still running. |
| `replay_scope` | 409 Conflict | The stored response was authorized under a different scope than this caller. |
| `key_reuse` | 422 Unprocessable Entity | The same key came with a different payload. |

The body is `{ statusCode, error, message, idempotencyKey, reason }`, with the error's message.

In NestJS applications using `@cqrs-ddd/nestjs`, `ErrorFilter` maps these errors automatically.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-idempotency/)

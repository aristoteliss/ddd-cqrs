---
title: "@cqrs-ddd/pipeline-idempotency"
description: "Deduplicate commands by operation key, replay the stored response of a completed one, and refuse a key reused with another request."
sidebar:
  order: 13
---

Deduplicates commands by operation key. While the record of a key is live, a second call with that key does not run the handler: it receives the stored response when the first call has completed, and is rejected with HTTP 409 Conflict while the first call is still running. Reusing the same key with an altered request payload is rejected with HTTP 422 Unprocessable Entity.

This is deduplication within the lifetime of a record, not exactly-once execution: [Guarantees and Limits](#guarantees-and-limits) lists when a handler can run again for the same key.

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
Claim Key K atomically (Status: 'in_progress', expires after ttl)
         │
         ├─ Claimed ────────────────────────► Execute Handler Pipeline
         │                                            │
         │                                     Success?
         │                                     ├─ Yes: Save Response & Status: 'completed' (expires after ttl)
         │                                     └─ No:  Release Key (if releaseOnError: true)
         │
         └─ A live record exists for Key K
                │
                ├─ Request name or payload fingerprint does NOT match
                │      └─► Reject with IdempotencyConflictError (reason: 'key_reuse', HTTP 422)
                │
                ├─ Status is 'in_progress'
                │      └─► Reject with IdempotencyConflictError (reason: 'in_progress', HTTP 409)
                │
                ├─ Status is 'completed' & Replay scope digest does NOT match
                │      └─► Reject with IdempotencyConflictError (reason: 'replay_scope', HTTP 409)
                │
                └─ Status is 'completed' & All checks pass
                       └─► Return stored response immediately (no handler execution)
```

## Guarantees and Limits

With a store whose claim is atomic, as the three built-in stores are, the behavior guarantees that:

- Of several calls that share a key while its record is live, one runs the handler. The others are rejected with `in_progress` while it runs and receive its stored response once it has completed.
- A completed response is replayed until its record expires, `ttl` after completion.
- Only the execution that owns a claim completes or releases it, so an execution that outlives its claim never overwrites or deletes a newer one.

It does not guarantee that the handler runs once. The handler can run again for the same key when:

- **The record expires.** `ttl` bounds the in-progress claim as well as the completed record. A handler that runs longer than `ttl` loses its claim, and the next call with the key runs the handler a second time; the first execution still returns its result, with `IDEMPOTENCY_OWNERSHIP_LOST_ITEM` set on the context. A process that stops during the handler leaves its claim behind: retries are rejected with `in_progress` until the claim expires, and the first retry after that runs the handler again.
- **The handler throws.** With `releaseOnError: true` the claim is deleted and a retry runs the handler again, including whatever the failed attempt did before it threw. With `false` the claim stays until it expires and retries are rejected with `in_progress`.
- **The response cannot be stored.** When the handler succeeds but its response is not serializable, or the store rejects the write, the call throws `IdempotencyCompletionError` with `executionSucceeded: true` and `phase` `'snapshot'` or `'store'`. The effects have happened and no response is stored: a retry is rejected with `in_progress` while the claim is live and runs the handler again after it expires.
- **The store loses the record or is not shared.** `MemoryIdempotencyStore` deduplicates inside one process and forgets every record when the process stops. Several instances need a store they all reach, and the guarantees above are as durable as that store.

The record and the handler's effects are separate writes: the behavior does not put them in one transaction, with any store. An effect that must not repeat therefore needs its own protection. Pass a stable operation id to an external provider that deduplicates on it, as the payment example below does, or make the handler's own write conditional on that id.

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
  operation: (ctx) => (ctx.request as PaymentDto).operationId,
  includeTenant: false, // a single-tenant service; keep the default to partition by tenant
});

export const chargePayment = pipeline.wrap(
  { name: 'chargePayment', kind: 'command' },
  idempotent({ keyFactory: paymentKey, ttl: 86_400_000 }),
)(async (payment: PaymentDto) =>
  paymentGateway.charge(payment, { idempotencyKey: payment.operationId }),
);
```

The operation id also goes to the payment provider. The record of the pipeline alone does not prevent a second charge after a stopped process or an expired claim; the provider's own deduplication on the same id does.

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

Suitable for unit tests and single-node development. Records live in the process and are lost when it stops:

```typescript
import { MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new MemoryIdempotencyStore({
  cleanupIntervalMs: 60_000,
});

// Teardown in tests:
store.destroy();
```

### Redis Store (`RedisIdempotencyStore`)

Shares records across instances, using atomic Redis commands:

```typescript
import { RedisIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new RedisIdempotencyStore(redisClient, {
  keyPrefix: 'idemp:', // default 'idempotency:'
});
```

### PostgreSQL Store (`PostgresIdempotencyStore`)

Shares records across instances in a PostgreSQL table, without a separate Redis. The store runs its own statements; a record is not written in the transaction of the handler:

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
| `ttl` | `number` | `86_400_000` (24h) | Lifetime in milliseconds of the in-progress claim and, restarted at completion, of the completed record. Set it longer than the slowest execution. |
| `scope` | `DeclaredKind[]` | `['command']` | Request kinds the behavior applies to. |
| `fingerprint` | `boolean` | `true` | Compares a SHA-256 hash of the request payload. A mismatch throws `key_reuse` (422). |
| `replayScopeFactory` | `IdempotencyReplayScopeFactory` | `undefined` | Computes authorization digest for safe replays. |
| `releaseOnError` | `boolean` | `true` | Deletes the claim when the handler throws, so a retry runs the handler again. `false` keeps the claim until it expires. |

## HTTP Error Translation

`IdempotencyConflictError` translates to HTTP responses via `@cqrs-ddd/pipeline-idempotency/http`:

| Conflict Reason | HTTP Status | Description |
| --- | --- | --- |
| `in_progress` | 409 Conflict | An execution with the same key is still running. |
| `replay_scope` | 409 Conflict | The stored response was authorized under a different scope than this caller. |
| `key_reuse` | 422 Unprocessable Entity | The same key came with a different payload. |

The body is `{ statusCode, error, message, idempotencyKey, reason }`, with the error's message.

`IdempotencyCompletionError` has no HTTP translation: the handler succeeded and its response was not stored, so the application decides how to answer the caller and whether to reconcile.

In NestJS applications using `@cqrs-ddd/nestjs`, `ErrorFilter` maps these errors automatically.

## API Reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-idempotency/)

---
title: "@cqrs-ddd/pipeline-idempotency"
description: "Run a command once per operation key, replay the stored response to duplicates, and refuse a key reused with another request."
sidebar:
  order: 13
---

Makes commands idempotent. A command runs once per operation key; a duplicate receives the
stored response instead of running again; the same key with a different request is
refused. With a replay scope, a stored response is replayed only to a caller authorized
under the same permissions. Memory, Redis and PostgreSQL stores are included.

## Installation

```bash
pnpm add @cqrs-ddd/pipeline-idempotency @cqrs-ddd/pipeline
```

The Redis store takes a connected `redis` client and the PostgreSQL store a `pg` pool; the
application installs whichever it uses.

## Usage

```ts
import { createPipeline } from '@cqrs-ddd/pipeline';
import {
  createPartitionedIdempotencyKeyFactory,
  IdempotencyBehavior,
  idempotent,
  RedisIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';

const pipeline = createPipeline({
  behaviors: [new IdempotencyBehavior(new RedisIdempotencyStore(redisClient))],
});

const paymentKey = createPartitionedIdempotencyKeyFactory({
  principal: (ctx) => ctx.items.get('userId') as string | undefined,
  operation: (ctx) => ctx.items.get('idempotencyKey') as string | undefined,
  onMissingOperation: 'skip',
});

export const createPayment = pipeline.wrap(
  { name: 'createPayment', kind: 'command' },
  idempotent({ keyFactory: paymentKey, ttl: 86_400_000 }),
)(async (payment: PaymentRequest) => payments.charge(payment));
```

The behavior's constructor takes the store, optional defaults for every operation and an
optional logger.

## Stores

| Store | Notes |
| --- | --- |
| `MemoryIdempotencyStore` | one process only; for tests and single-instance services. `destroy()` stops its cleanup timer |
| `RedisIdempotencyStore` | takes a connected `redis` client |
| `PostgresIdempotencyStore` | takes a `pg` pool or client; create its table once with `createIdempotencyTableSql()` |

Another backend implements the `IdempotencyStore` interface.

## Partitioned keys

`createPartitionedIdempotencyKeyFactory(options)` builds a key from the tenant, the
principal, the operation name and the operation id:

| Option | Meaning | Default |
| --- | --- | --- |
| `principal` | who performs the operation; a missing principal always throws | required |
| `operation` | which operation this is, such as an `Idempotency-Key` header | required |
| `onMissingOperation` | `'throw'` rejects a request without an operation id; `'skip'` runs it without deduplication | `'throw'` |
| `action` | the operation name in the key | `context.requestName` |
| `version` | a leading namespace segment | none |
| `includeTenant`, `requireTenant` | the tenant segment, as for the other keyed behaviors | `true` |

## Options

| Option | Meaning | Default |
| --- | --- | --- |
| `keyFactory` | the key factory; required when the behavior runs | none |
| `ttl` | how long a key is remembered, in milliseconds | `86_400_000` (24 hours) |
| `scope` | request kinds the behavior applies to | `['command']` |
| `fingerprint` | refuse a key reused with a different request | `true` |
| `replayScopeFactory` | a digest of the caller's permissions; a duplicate with another digest is refused instead of replayed | none |
| `releaseOnError` | release the key when the command throws, so the client can retry | `true` |

`idempotent({ inheritModuleKey: true })` takes the key factory from the constructor
defaults.

## Ordering and security

The behavior orders itself after `CaslBehavior` when both are present. Use
`replayScopeFactory` (for example `abilityDigest` of
[`@cqrs-ddd/pipeline-casl`](/ddd-cqrs/packages/pipeline-casl/)) for any operation whose
response depends on the caller's permissions; a permission change then refuses the replay
and never runs the command a second time.

`IDEMPOTENCY_REPLAYED_ITEM_TOKEN` tells later behaviors that the response was replayed;
`buildIdempotencyAttributes` turns the decision into trace or audit attributes.

## HTTP errors

A conflict throws `IdempotencyConflictError`. `toHttpResponse(error)` from
`@cqrs-ddd/pipeline-idempotency/http` answers 409 for an operation still in progress or a
replay scope mismatch, and 422 for a key reused with another request. See
[HTTP errors](/ddd-cqrs/guides/http-errors/).

## API reference

[API reference](/ddd-cqrs/api/cqrs-ddd/pipeline-idempotency/)

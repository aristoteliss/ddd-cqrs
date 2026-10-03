---
title: Plain Node.js
description: Wrap async functions with validation, idempotency, caching and logging in a project with no framework and no build step.
sidebar:
  order: 1
---

This guide builds two order functions in plain `.mjs` files, run by Node.js as they are:
a command that validates its input and runs once per order id, and a query served from a
cache.

## Install

```bash
pnpm add @cqrs-ddd/pipeline @cqrs-ddd/pipeline-cache @cqrs-ddd/pipeline-idempotency \
  @cqrs-ddd/pipeline-zod cache-manager keyv zod
```

## One pipeline

The behaviors that need something are constructed with it: the idempotency store, the
cache, and the logger every behavior writes through. A global `logging()` entry logs every
call.

```js
import { createPipeline, LoggingBehavior, logging } from '@cqrs-ddd/pipeline';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import { IdempotencyBehavior, MemoryIdempotencyStore } from '@cqrs-ddd/pipeline-idempotency';

const store = new MemoryIdempotencyStore();

const pipeline = createPipeline({
  behaviors: [
    new LoggingBehavior(console),
    new IdempotencyBehavior(store, {}, console),
    new CacheBehavior(buildCache({}), {}, console),
  ],
  globalBehaviors: { before: [logging({ requestResponseLogLevel: 'none' })] },
});
```

## A command

`validated(order)` parses the input with Zod and hands the function the parsed copy;
`idempotent()` runs it once per order id and replays the stored result for a repeated id.

```js
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const order = z.object({
  orderId: z.string().min(1),
  sku: z.enum(['apple', 'pear']),
  qty: z.coerce.number().int().positive(),
});

export const placeOrder = pipeline.wrap(
  { name: 'placeOrder', kind: 'command' },
  validated(order),
  idempotent({ keyFactory: (context) => context.request.orderId }),
)(async (input) => ({ orderId: input.orderId, total: prices.get(input.sku) * input.qty }));
```

## A query

`cache()` serves the price from memory after its first read. The key factory says the
price is the same for every caller, so no tenant or principal is needed.

```js
import { cache, createPartitionedCacheKeyFactory } from '@cqrs-ddd/pipeline-cache';

const publicPrice = createPartitionedCacheKeyFactory({
  includeTenant: false,
  principal: () => 'public',
  requireScope: false,
});

export const getPrice = pipeline.wrap(
  { name: 'getPrice', kind: 'query' },
  cache({ key: publicPrice, ttl: 60_000 }),
)(async (sku) => ({ sku, price: prices.get(sku) }));
```

## Calling them

The wrapped functions are ordinary async functions. A repeated order id returns the first
result without running the function again; a second price read comes from the cache. A
validation error maps to a 400 answer with `toHttpResponse()` from
`@cqrs-ddd/pipeline-zod/http`; see [HTTP errors](/ddd-cqrs/guides/http-errors/).

```js
import { toHttpResponse } from '@cqrs-ddd/pipeline-zod/http';

await placeOrder({ orderId: 'o-1', sku: 'apple', qty: '2' }); // { orderId: 'o-1', total: 240 }
await placeOrder({ orderId: 'o-1', sku: 'apple', qty: '2' }); // replayed

try {
  await placeOrder({ orderId: 'o-2', sku: 'plum', qty: 0 });
} catch (error) {
  toHttpResponse(error).status; // 400
}

store.destroy();
```

`store.destroy()` stops the memory store's periodic cleanup of expired records.

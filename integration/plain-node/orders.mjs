/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline, LoggingBehavior, logging } from '@cqrs-ddd/pipeline';
import {
  buildCache,
  CacheBehavior,
  cache,
  createPartitionedCacheKeyFactory,
} from '@cqrs-ddd/pipeline-cache';
import {
  IdempotencyBehavior,
  idempotent,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import { validated } from '@cqrs-ddd/pipeline-zod';
import { z } from 'zod';

const prices = new Map([
  ['apple', 120],
  ['pear', 90],
]);

const order = z.object({
  orderId: z.string().min(1),
  sku: z.enum(['apple', 'pear']),
  qty: z.coerce.number().int().positive(),
});

const publicPrice = createPartitionedCacheKeyFactory({
  includeTenant: false,
  principal: () => 'public',
  requireScope: false,
});

/**
 * Builds the order functions of the example on one pipeline: every call is logged,
 * `placeOrder` validates its input and runs once per order id, and `getPrice` is
 * served from a cache after its first read.
 *
 * @param {{ logger?: import('@cqrs-ddd/pipeline').PipelineLogger }} [options]
 * @example
 * ```js
 * const orders = createOrders();
 * await orders.placeOrder({ orderId: 'o-1', sku: 'apple', qty: '2' });
 * orders.close();
 * ```
 */
export function createOrders({ logger = console } = {}) {
  const store = new MemoryIdempotencyStore();
  const placed = [];
  let reads = 0;

  const pipeline = createPipeline({
    behaviors: [
      new LoggingBehavior(logger),
      new IdempotencyBehavior(store, {}, logger),
      new CacheBehavior(buildCache({}), {}, logger),
    ],
    globalBehaviors: { before: [logging({ requestResponseLogLevel: 'none' })] },
    logger,
  });

  const placeOrder = pipeline.wrap(
    { name: 'placeOrder', kind: 'command' },
    validated(order),
    idempotent({ keyFactory: (context) => context.request.orderId }),
  )(async (input) => {
    const total = prices.get(input.sku) * input.qty;
    placed.push(input.orderId);
    return { orderId: input.orderId, total };
  });

  const getPrice = pipeline.wrap(
    { name: 'getPrice', kind: 'query' },
    cache({ key: publicPrice, ttl: 60_000 }),
  )(async (sku) => {
    reads += 1;
    return { sku, price: prices.get(sku) };
  });

  return {
    placeOrder,
    getPrice,
    placed: () => [...placed],
    reads: () => reads,
    close: () => store.destroy(),
  };
}

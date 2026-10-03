/* Copyright (C) 2026-present Aristotelis — see repository license. */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { ZodValidationError } from '@cqrs-ddd/pipeline-zod';
import { toHttpResponse } from '@cqrs-ddd/pipeline-zod/http';
import { createOrders } from './orders.mjs';

const lines = [];
const logger = {
  log: (message) => lines.push(message),
  error: (message) => lines.push(message),
  warn: (message) => lines.push(message),
  debug: () => {},
  verbose: () => {},
};
const orders = createOrders({ logger });

after(() => orders.close());

describe('a plain Node.js module', () => {
  it('places an order once per order id and replays the first result', async () => {
    const first = await orders.placeOrder({
      orderId: 'o-1',
      sku: 'apple',
      qty: '2',
    });
    const again = await orders.placeOrder({
      orderId: 'o-1',
      sku: 'apple',
      qty: '2',
    });

    assert.deepEqual(first, { orderId: 'o-1', total: 240 });
    assert.deepEqual(again, first);
    assert.deepEqual(orders.placed(), ['o-1']);
  });

  it('rejects an invalid order before it runs, as a 400 answer', async () => {
    const error = await orders
      .placeOrder({ orderId: 'o-2', sku: 'plum', qty: 0 })
      .catch((e) => e);

    assert.ok(error instanceof ZodValidationError);
    assert.equal(toHttpResponse(error).status, 400);
    assert.deepEqual(orders.placed(), ['o-1']);
  });

  it('serves a repeated price query from the cache', async () => {
    assert.deepEqual(await orders.getPrice('pear'), { sku: 'pear', price: 90 });
    assert.deepEqual(await orders.getPrice('pear'), { sku: 'pear', price: 90 });
    assert.equal(orders.reads(), 1);
  });

  it('logs every call with its kind and name', () => {
    assert.ok(
      lines.some((line) =>
        /COMMAND placeOrder → placeOrder completed/.test(line),
      ),
    );
    assert.ok(
      lines.some((line) => /QUERY getPrice → getPrice completed/.test(line)),
    );
  });
});

/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { afterAll, describe, expect, it } from 'vitest';
import { IdempotencyConflictError } from './errors/idempotency-conflict.error.js';
import { idempotent } from './helpers/idempotency.intent.js';
import { toHttpResponse } from './http.js';
import { IdempotencyBehavior } from './idempotency.behavior.js';
import { MemoryIdempotencyStore } from './stores/memory.store.js';

describe('IdempotencyBehavior on wrapped functions', () => {
  const store = new MemoryIdempotencyStore();
  const pipeline = createPipeline({
    behaviors: [new IdempotencyBehavior(store)],
  });

  it('runs a command once per key and replays the stored response', async () => {
    let charges = 0;
    const charge = pipeline.wrap(
      { name: 'charge', kind: 'command' },
      idempotent({
        keyFactory: (context) => (context.request as { key: string }).key,
      }),
    )(async (input: { key: string; amount: number }) => {
      charges += 1;
      return { chargeId: `ch_${charges}`, amount: input.amount };
    });

    const first = await charge({ key: 'order-1', amount: 100 });
    await expect(charge({ key: 'order-1', amount: 100 })).resolves.toEqual(
      first,
    );
    expect(charges).toBe(1);

    const error = await charge({ key: 'order-1', amount: 999 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(IdempotencyConflictError);
    expect(toHttpResponse(error as IdempotencyConflictError)).toMatchObject({
      status: 422,
      body: {
        error: 'Unprocessable Entity',
        reason: 'key_reuse',
        idempotencyKey: 'order-1',
      },
    });
  });

  it('maps an operation in progress to 409', () => {
    const response = toHttpResponse(
      new IdempotencyConflictError({
        key: 'k',
        requestName: 'charge',
        reason: 'in_progress',
      }),
    );
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Conflict');
  });

  it('cannot be built without a store', () => {
    expect(() => new IdempotencyBehavior(undefined as never)).toThrow(
      'missing required methods',
    );
  });

  afterAll(() => store.destroy());
});

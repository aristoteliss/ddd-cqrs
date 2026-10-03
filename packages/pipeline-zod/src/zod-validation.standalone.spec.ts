/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationError } from './errors/zod-validation.error.js';
import { validated } from './helpers/validated.intent.js';
import { toHttpResponse } from './http.js';

const pipeline = createPipeline();

describe('ZodValidationBehavior on wrapped functions', () => {
  it('hands the function the parsed copy and leaves the caller object as it was', async () => {
    const input = { sku: 'a', qty: '2', extra: true };
    const order = pipeline.wrap(
      { name: 'order', kind: 'command' },
      validated(z.object({ sku: z.string(), qty: z.coerce.number() })),
    )(async (value: { sku: string; qty: number }) => value);

    await expect(order(input as never)).resolves.toEqual({ sku: 'a', qty: 2 });
    expect(input).toEqual({ sku: 'a', qty: '2', extra: true });
  });

  it('validates several arguments as a tuple', async () => {
    const add = pipeline.wrap(
      { name: 'add', kind: 'query' },
      validated(z.tuple([z.coerce.number(), z.coerce.number()])),
    )(async (a: number, b: number) => a + b);

    await expect(add('2' as never, '3' as never)).resolves.toBe(5);
  });

  it('rejects an invalid input before the function runs', async () => {
    let ran = false;
    const order = pipeline.wrap(
      { name: 'order', kind: 'command' },
      validated(z.object({ qty: z.number().int().positive() })),
    )(async (_input: { qty: number }) => {
      ran = true;
    });

    const error = await order({ qty: -1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ZodValidationError);
    expect(ran).toBe(false);
    expect(toHttpResponse(error as ZodValidationError)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: (error as ZodValidationError).message,
        details: (error as ZodValidationError).details,
      },
      headers: {},
    });
  });
});

/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodMapper } from './create-zod-mapper.js';
import { ZodValidationError } from './errors/zod-validation.error.js';
import { toHttpResponse } from './http.js';

describe('createZodMapper', () => {
  const schema = z.object({
    id: z.string().min(1),
    count: z.number().int().positive(),
  });
  const mapper = createZodMapper(schema);

  it('maps valid input to the validated output', () => {
    expect(mapper.map({ id: 'item-1', count: 5 })).toEqual({
      id: 'item-1',
      count: 5,
    });
  });

  it('returns the transformed output and exposes the schema', () => {
    const toCommand = createZodMapper(
      schema.transform(({ id, count }) => ({ kind: 'command', id, count })),
    );

    expect(toCommand.map({ id: 'item-1', count: 2 })).toEqual({
      kind: 'command',
      id: 'item-1',
      count: 2,
    });
    expect(mapper.schema).toBe(schema);
  });

  it('throws a ZodValidationError with the field errors, answered with HTTP 400', () => {
    let error: unknown;
    try {
      mapper.map({ id: '', count: -1 });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ZodValidationError);
    expect((error as ZodValidationError).details).toEqual({
      formErrors: [],
      fieldErrors: {
        id: [expect.any(String)],
        count: [expect.any(String)],
      },
    });
    expect(toHttpResponse(error as ZodValidationError).status).toBe(400);
  });
});

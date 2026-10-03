/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { createPipeline } from '../create-pipeline.js';
import type {
  IPipelineBehavior,
  NextDelegate,
} from '../interfaces/pipeline.behavior.interface.js';
import type { IPipelineContext } from '../interfaces/pipeline.context.interface.js';
import { replaceRequest } from './replace-request.js';

function replacing(make: (request: unknown) => unknown) {
  return class Replace implements IPipelineBehavior {
    handle(context: IPipelineContext, next: NextDelegate) {
      replaceRequest(context, make(context.request));
      return next();
    }
  };
}

describe('replaceRequest', () => {
  it('hands a single-argument function the replacement and leaves the caller object as it was', async () => {
    const pipeline = createPipeline();
    const input = { qty: '3' };
    const order = pipeline.wrap(
      { name: 'order', kind: 'command' },
      replacing((request) => ({
        qty: Number((request as { qty: string }).qty),
      })),
    )((value: { qty: number }) => value);

    await expect(order(input as never)).resolves.toEqual({ qty: 3 });
    expect(input).toEqual({ qty: '3' });
  });

  it('hands a multi-argument function the replacement argument array', async () => {
    const pipeline = createPipeline();
    const add = pipeline.wrap(
      { name: 'add', kind: 'query' },
      replacing((request) => (request as string[]).map(Number)),
    )((a: number, b: number) => a + b);

    await expect(add('2' as never, '5' as never)).resolves.toBe(7);
  });

  it('refuses a non-array replacement for a multi-argument call', async () => {
    const add = createPipeline().wrap(
      { name: 'add', kind: 'query' },
      replacing(() => 'not an array'),
    )((a: number, b: number) => a + b);

    await expect(add(1, 2)).rejects.toThrow('pass the new argument array');
  });

  it('refuses a context that cannot replace its request', () => {
    expect(() =>
      replaceRequest({ requestName: 'Custom' } as IPipelineContext, 1),
    ).toThrow('cannot replace its request');
  });

  it('accepts null and undefined as the only argument', async () => {
    const pipeline = createPipeline();
    const identity = pipeline.wrap(
      { name: 'identity', kind: 'query' },
      replacing((request) => request),
    )((value: unknown) => value);

    await expect(identity(null)).resolves.toBeNull();
    await expect(identity(undefined)).resolves.toBeUndefined();
  });
});

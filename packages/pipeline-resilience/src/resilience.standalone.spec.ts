/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createPipeline } from '@cqrs-ddd/pipeline';
import { describe, expect, it } from 'vitest';
import { resilience } from './helpers/resilience.intent.js';

class TransientError extends Error {}

describe('ResilienceBehavior on wrapped functions', () => {
  it('retries a query function on a transient error', async () => {
    let calls = 0;
    const lookup = createPipeline().wrap(
      { name: 'lookup', kind: 'query' },
      resilience({
        retry: { maxAttempts: 2 },
        handle: (error) => error instanceof TransientError,
      }),
    )(async () => {
      calls += 1;
      if (calls === 1) throw new TransientError('try again');
      return 'found';
    });

    await expect(lookup()).resolves.toBe('found');
    expect(calls).toBe(2);
  });

  it('refuses to retry a command that is not declared replay-safe', () => {
    expect(() =>
      createPipeline().wrap(
        { name: 'pay', kind: 'command' },
        resilience({ retry: { maxAttempts: 2 }, handleAllErrors: true }),
      )(async () => 'paid'),
    ).toThrow('replaySafe');
  });
});
